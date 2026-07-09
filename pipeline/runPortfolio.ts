import "dotenv/config";
import { fetchDailyHistory, type DailyBar } from "../lib/marketData";
import { computeIndicators, decideActions, type HoldingIndicators } from "../lib/portfolioSignals";
import { backtestBuyHold, backtestTrend200, backtestMomentumRotation } from "../lib/backtest";
import { PORTFOLIO_HOLDINGS, PORTFOLIO_RULES } from "./portfolioHoldings";
import {
  synthesizePortfolioCommentary,
  PORTFOLIO_PRICE_PER_MTOK_INPUT,
  PORTFOLIO_PRICE_PER_MTOK_OUTPUT,
  type PortfolioSignalInput,
  type BacktestSummaryInput,
} from "./synthesizePortfolio";
import { sendAlertEmail } from "./sendAlertEmail";
import { writePortfolioToDb } from "./writePortfolioToDb";
import { withRetry } from "./retry";
import { createAdminClient } from "../lib/supabase";

function todayBeijingDate(): string {
  const now = new Date();
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijing.toISOString().slice(0, 10);
}

// 在拉数据、调用 Claude 之前先确认数据表已建好 —— 表不存在时提前退出,不浪费 API 花费。
async function ensureTablesExist(): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("portfolio_holdings").select("ticker").limit(1);
  if (error) {
    throw new Error(
      `portfolio_holdings 表不可用(${error.message})。` +
        `如果还没建表:去 Supabase 项目的 SQL Editor 执行 supabase/schema_portfolio.sql,然后重新运行本流水线。`
    );
  }
}

async function main() {
  const startedAt = Date.now();
  const reportDate = todayBeijingDate();
  console.log(`\n===== 持仓量化监控流水线启动:${reportDate} =====\n`);

  await ensureTablesExist();

  // --- 步骤 1/5: 拉取每支持仓约10年日线(信号和回测共用同一份数据) ---
  console.log(`--- 步骤 1/5: 拉取 ${PORTFOLIO_HOLDINGS.length} 支持仓的历史日线 ---`);
  const barsByTicker = new Map<string, DailyBar[]>();
  for (const [index, h] of PORTFOLIO_HOLDINGS.entries()) {
    if (index > 0) await new Promise((r) => setTimeout(r, 250));
    try {
      const { bars, source } = await fetchDailyHistory(h.ticker, PORTFOLIO_RULES.backtestYears);
      barsByTicker.set(h.ticker, bars);
      console.log(`[runPortfolio]   ${h.ticker}: ${bars.length} 根日线 (数据源: ${source})`);
    } catch (err) {
      console.warn(`[runPortfolio]   ${h.ticker}: 抓取失败 - ${(err as Error).message}`);
    }
  }
  if (barsByTicker.size === 0) {
    throw new Error("所有持仓的行情数据都抓取失败,终止本次运行");
  }

  // --- 步骤 2/5: 计算当日信号 + 动量排名 + 行动建议(纯规则,不经过AI) ---
  console.log("\n--- 步骤 2/5: 计算量化信号 ---");
  const indicatorsByTicker = new Map<string, HoldingIndicators>();
  for (const [ticker, bars] of barsByTicker) {
    indicatorsByTicker.set(ticker, computeIndicators(bars));
  }
  const decisions = decideActions(indicatorsByTicker, PORTFOLIO_RULES);

  const signals: PortfolioSignalInput[] = [];
  for (const h of PORTFOLIO_HOLDINGS) {
    const indicators = indicatorsByTicker.get(h.ticker);
    const decision = decisions.get(h.ticker);
    if (!indicators || !decision) continue;
    signals.push({
      ticker: h.ticker,
      companyName: h.companyName,
      shares: h.shares,
      costBasis: h.costBasis,
      indicators,
      decision,
    });
    console.log(
      `[runPortfolio]   ${h.ticker}: 建议=${decision.action} 动量排名=${decision.momentumRank ?? "N/A"}${decision.reasons.length > 0 ? ` | ${decision.reasons.join("; ")}` : ""}`
    );
  }
  const alerts = signals.filter((s) => s.decision.alertFlag);
  console.log(`[runPortfolio] 共 ${alerts.length} 支持仓触发信号`);

  // --- 步骤 3/5: 回测(用已拉取的数据本地计算,零额外成本,每天刷新) ---
  console.log("\n--- 步骤 3/5: 回测验证规则历史表现 ---");
  const backtests: BacktestSummaryInput[] = [];
  for (const [ticker, bars] of barsByTicker) {
    if (bars.length < 260) {
      console.warn(`[runPortfolio]   ${ticker}: 历史数据不足一年,跳过回测`);
      continue;
    }
    backtests.push({ ticker, strategy: "buy_hold", stats: backtestBuyHold(bars) });
    backtests.push({ ticker, strategy: "trend_200", stats: backtestTrend200(bars) });
  }
  const rotationResult = backtestMomentumRotation(barsByTicker, PORTFOLIO_RULES.rotationTopN);
  if (rotationResult) {
    backtests.push({ ticker: "PORTFOLIO", strategy: "momentum_rotation", stats: rotationResult.rotation });
    backtests.push({ ticker: "PORTFOLIO", strategy: "buy_hold", stats: rotationResult.equalWeightBuyHold });
  }
  for (const b of backtests) {
    console.log(
      `[runPortfolio]   ${b.ticker} ${b.strategy}: 年化=${b.stats.cagrPct ?? "N/A"}% 最大回撤=${b.stats.maxDrawdownPct ?? "N/A"}% 夏普=${b.stats.sharpe ?? "N/A"}`
    );
  }

  // --- 步骤 4/5: Claude Sonnet 点评 ---
  console.log("\n--- 步骤 4/5: 调用 Claude 生成持仓点评 ---");
  let commentaryMd: string | null = null;
  let rotationMd: string | null = null;
  let estimatedCostUsd = 0;
  try {
    const { commentaryMd: c, rotationMd: r, usage } = await withRetry(
      () => synthesizePortfolioCommentary(reportDate, signals, backtests),
      3,
      "synthesizePortfolioCommentary"
    );
    commentaryMd = c;
    rotationMd = r;
    estimatedCostUsd =
      (usage.input_tokens / 1_000_000) * PORTFOLIO_PRICE_PER_MTOK_INPUT +
      (usage.output_tokens / 1_000_000) * PORTFOLIO_PRICE_PER_MTOK_OUTPUT;
  } catch (err) {
    // 点评失败不阻塞信号和预警——量化信号本身不依赖AI
    console.warn(`[runPortfolio] Claude 点评失败,继续写入纯规则信号: ${(err as Error).message}`);
  }

  // --- 步骤 5/5: 发预警邮件 + 写入数据库 ---
  console.log("\n--- 步骤 5/5: 通知与落库 ---");
  const siteUrl = process.env.SITE_URL ?? null;
  const emailSent = await sendAlertEmail(reportDate, alerts, commentaryMd ?? "(本次AI点评生成失败,请直接查看信号表)", siteUrl);
  const counts = await writePortfolioToDb(
    reportDate,
    PORTFOLIO_HOLDINGS,
    signals,
    backtests,
    commentaryMd,
    rotationMd,
    emailSent
  );

  const durationMs = Date.now() - startedAt;
  console.log(`\n===== 完成 =====`);
  console.log(`报告日期: ${reportDate}`);
  console.log(
    `写入: ${counts.signalsWritten} 支持仓信号, ${counts.backtestsWritten} 条回测结果; 预警 ${alerts.length} 项${emailSent ? "(邮件已发送)" : ""}`
  );
  console.log(`耗时: ${(durationMs / 1000).toFixed(1)}秒`);
  console.log(`预估本次 Claude API 花费: $${estimatedCostUsd.toFixed(4)}`);
}

main().catch((err) => {
  console.error("[runPortfolio] 流水线致命错误:", err);
  process.exit(1);
});

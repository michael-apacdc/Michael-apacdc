import "dotenv/config";
import { createAdminClient } from "../lib/supabase";
import { fetchDailyHistory, type DailyBar } from "../lib/marketData";
import {
  buildAligned,
  estimateWeights,
  scoreDate,
  pickTopN,
  basketReturn,
  type AlignedData,
} from "../lib/aiQuant";
import { AI_UNIVERSE } from "../lib/aiUniverse";
import {
  synthesizeAiQuantCommentary,
  AIQUANT_PRICE_PER_MTOK_INPUT,
  AIQUANT_PRICE_PER_MTOK_OUTPUT,
  type LiveTrackStats,
} from "./synthesizeAiQuant";
import { withRetry } from "./retry";

const HORIZON = 5; // 与模型预测窗口一致:5个交易日后回填信号结果

function todayBeijingDate(): string {
  const beijing = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return beijing.toISOString().slice(0, 10);
}

// 表没建好就提前退出,不浪费行情抓取和 Claude API 花费
async function ensureTablesExist(): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("ai_quant_snapshot").select("report_date").limit(1);
  if (error) {
    throw new Error(
      `ai_quant_snapshot 表不可用(${error.message})。` +
        `如果还没建表:去 Supabase 项目的 SQL Editor 执行 supabase/schema_aiquant.sql,然后重新运行。`
    );
  }
}

/** 回填已到期(信号日之后已有≥5个交易日数据)的历史信号的真实结果。 */
async function resolvePendingPicks(data: AlignedData): Promise<number> {
  const supabase = createAdminClient();
  const { data: pending, error } = await supabase
    .from("ai_quant_picks")
    .select("id, report_date, ticker")
    .eq("resolved", false);
  if (error) throw new Error(`读取未回填信号失败: ${error.message}`);
  if (!pending || pending.length === 0) return 0;

  const dateIdx = new Map(data.dates.map((d, i) => [d, i]));
  let resolvedCount = 0;
  for (const p of pending) {
    // 信号日可能是非交易日历上的北京时间日期,找它之后的第一个交易日作为起点
    let t = dateIdx.get(p.report_date);
    if (t == null) {
      const after = data.dates.findIndex((d) => d >= p.report_date);
      if (after < 0) continue;
      t = after;
    }
    if (t + HORIZON >= data.dates.length) continue; // 还没到期

    const ti = data.tickers.indexOf(p.ticker);
    if (ti < 0) continue;
    const a = data.adj[ti][t];
    const b = data.adj[ti][t + HORIZON];
    const bk = basketReturn(data, t, t + HORIZON);
    if (a == null || b == null || a <= 0 || bk == null) continue;

    const fwd = (b / a - 1) * 100;
    const basket = bk * 100;
    const excess = fwd - basket;
    const { error: upErr } = await supabase
      .from("ai_quant_picks")
      .update({
        resolved: true,
        resolve_date: data.dates[t + HORIZON],
        fwd_return_pct: Number(fwd.toFixed(3)),
        basket_return_pct: Number(basket.toFixed(3)),
        excess_return_pct: Number(excess.toFixed(3)),
        hit: excess > 0,
      })
      .eq("id", p.id);
    if (upErr) {
      console.warn(`[runAiQuant] 回填 ${p.report_date}/${p.ticker} 失败: ${upErr.message}`);
      continue;
    }
    resolvedCount++;
  }
  return resolvedCount;
}

/** 汇总观察模式以来的实盘追踪成绩(信号级 + 信号日级)。 */
async function computeLiveStats(): Promise<LiveTrackStats> {
  const supabase = createAdminClient();
  const { data: rows, error } = await supabase
    .from("ai_quant_picks")
    .select("report_date, excess_return_pct, hit")
    .eq("resolved", true);
  if (error) throw new Error(`读取实盘追踪数据失败: ${error.message}`);
  const resolved = rows ?? [];
  const hits = resolved.filter((r) => r.hit).length;
  const avg =
    resolved.length > 0
      ? resolved.reduce((a, r) => a + Number(r.excess_return_pct ?? 0), 0) / resolved.length
      : null;

  const byDay = new Map<string, number[]>();
  for (const r of resolved) {
    const arr = byDay.get(r.report_date) ?? [];
    arr.push(Number(r.excess_return_pct ?? 0));
    byDay.set(r.report_date, arr);
  }
  let dayWins = 0;
  for (const arr of byDay.values()) {
    if (arr.reduce((a, b) => a + b, 0) / arr.length > 0) dayWins++;
  }

  return {
    resolvedPicks: resolved.length,
    resolvedHits: hits,
    avgExcessPct: avg != null ? Number(avg.toFixed(3)) : null,
    dayWindows: byDay.size,
    dayWins,
  };
}

async function main() {
  const startedAt = Date.now();
  const reportDate = todayBeijingDate();
  console.log(`\n===== AI板块相对强弱模型流水线启动:${reportDate}(观察验证模式)=====\n`);

  await ensureTablesExist();

  // --- 步骤 1/5: 拉取全池约10年日线 ---
  console.log(`--- 步骤 1/5: 拉取 ${AI_UNIVERSE.length} 支AI股历史日线 ---`);
  const barsByTicker = new Map<string, DailyBar[]>();
  for (const [index, s] of AI_UNIVERSE.entries()) {
    if (index > 0) await new Promise((r) => setTimeout(r, 250));
    try {
      const { bars, source } = await fetchDailyHistory(s.ticker, 10);
      barsByTicker.set(s.ticker, bars);
      console.log(`[runAiQuant]   ${s.ticker}: ${bars.length} 根日线 (${source})`);
    } catch (err) {
      console.warn(`[runAiQuant]   ${s.ticker}: 抓取失败 - ${(err as Error).message}`);
    }
  }
  if (barsByTicker.size < 20) {
    throw new Error(`只拉到 ${barsByTicker.size} 支股票的数据,不足以构成横截面,终止本次运行`);
  }
  const data = buildAligned(barsByTicker);
  const t = data.dates.length - 1;
  console.log(`[runAiQuant] 对齐完成: ${data.tickers.length} 支 x ${data.dates.length} 个交易日,最新=${data.dates[t]}`);

  // --- 步骤 2/5: 自动估计当日因子权重(最近约3年,和滚动检验同一套逻辑) ---
  console.log("\n--- 步骤 2/5: 估计当日因子权重 ---");
  const weights = estimateWeights(data, t);
  console.log(`[runAiQuant] 权重: ${JSON.stringify(weights)}`);

  // --- 步骤 3/5: 当日打分 + 强势名单;回填历史信号真实结果 ---
  console.log("\n--- 步骤 3/5: 打分与信号追踪回填 ---");
  const scores = scoreDate(data, t, weights);
  const subsectorOf = new Map(AI_UNIVERSE.map((s) => [s.ticker, s.subsector as string]));
  const picks = pickTopN(data, t, weights, subsectorOf);
  console.log(`[runAiQuant] 当日前5: ${picks.map((p) => `${p.ticker}(#${p.rank})`).join(", ")}`);
  const resolvedNow = await resolvePendingPicks(data);
  console.log(`[runAiQuant] 本次回填 ${resolvedNow} 条历史信号的真实结果`);
  const live = await computeLiveStats();
  console.log(
    `[runAiQuant] 实盘追踪: ${live.resolvedHits}/${live.resolvedPicks} 条跑赢板块` +
      (live.resolvedPicks > 0 ? ` (${((live.resolvedHits / live.resolvedPicks) * 100).toFixed(1)}%)` : "")
  );

  // --- 步骤 4/5: Claude Sonnet 点评(失败不阻塞) ---
  console.log("\n--- 步骤 4/5: 生成当日点评 ---");
  let commentaryMd: string | null = null;
  let estimatedCostUsd = 0;
  try {
    const { commentaryMd: c, usage } = await withRetry(
      () => synthesizeAiQuantCommentary(reportDate, scores, picks, weights, live),
      3,
      "synthesizeAiQuantCommentary"
    );
    commentaryMd = c;
    estimatedCostUsd =
      (usage.input_tokens / 1_000_000) * AIQUANT_PRICE_PER_MTOK_INPUT +
      (usage.output_tokens / 1_000_000) * AIQUANT_PRICE_PER_MTOK_OUTPUT;
  } catch (err) {
    console.warn(`[runAiQuant] Claude 点评失败,继续写入纯规则输出: ${(err as Error).message}`);
  }

  // --- 步骤 5/5: 写库 ---
  console.log("\n--- 步骤 5/5: 写入数据库 ---");
  const supabase = createAdminClient();

  await supabase.from("ai_quant_scores").delete().eq("report_date", reportDate);
  const scoreRows = scores.map((s) => ({
    report_date: reportDate,
    ticker: s.ticker,
    subsector: subsectorOf.get(s.ticker) ?? "other",
    score: s.score != null ? Number(s.score.toFixed(4)) : null,
    rank_position: s.rank,
    factor_z: s.factorZ,
  }));
  {
    const { error } = await supabase.from("ai_quant_scores").upsert(scoreRows, {
      onConflict: "report_date,ticker",
    });
    if (error) throw new Error(`写入 ai_quant_scores 失败: ${error.message}`);
  }

  await supabase.from("ai_quant_picks").delete().eq("report_date", reportDate);
  const pickRows = picks
    .map((p, i) => {
      const ti = data.tickers.indexOf(p.ticker);
      const entry = data.adj[ti][t];
      if (entry == null) return null;
      return {
        report_date: reportDate,
        ticker: p.ticker,
        rank_position: i + 1,
        score: p.score != null ? Number(p.score.toFixed(4)) : null,
        entry_adjclose: Number(entry.toFixed(4)),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);
  if (pickRows.length > 0) {
    const { error } = await supabase.from("ai_quant_picks").upsert(pickRows, {
      onConflict: "report_date,ticker",
    });
    if (error) throw new Error(`写入 ai_quant_picks 失败: ${error.message}`);
  }

  {
    const { error } = await supabase.from("ai_quant_snapshot").upsert(
      {
        report_date: reportDate,
        weights,
        commentary_md: commentaryMd,
        resolved_picks: live.resolvedPicks,
        resolved_hits: live.resolvedHits,
        avg_excess_pct: live.avgExcessPct,
        day_windows: live.dayWindows,
        day_wins: live.dayWins,
      },
      { onConflict: "report_date" }
    );
    if (error) throw new Error(`写入 ai_quant_snapshot 失败: ${error.message}`);
  }

  const durationMs = Date.now() - startedAt;
  console.log(`\n===== 完成 =====`);
  console.log(`报告日期: ${reportDate}`);
  console.log(`写入: ${scoreRows.length} 条打分, ${pickRows.length} 条强势名单; 回填 ${resolvedNow} 条历史信号`);
  console.log(`耗时: ${(durationMs / 1000).toFixed(1)}秒`);
  console.log(`预估本次 Claude API 花费: $${estimatedCostUsd.toFixed(4)}`);
}

main().catch((err) => {
  console.error("[runAiQuant] 流水线致命错误:", err);
  process.exit(1);
});

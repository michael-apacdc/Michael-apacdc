import { createAdminClient } from "../lib/supabase";
import type { PortfolioSignalInput, BacktestSummaryInput } from "./synthesizePortfolio";
import type { HoldingDef } from "./portfolioHoldings";

export async function writePortfolioToDb(
  reportDate: string,
  holdings: HoldingDef[],
  signals: PortfolioSignalInput[],
  backtests: BacktestSummaryInput[],
  commentaryMd: string | null,
  rotationMd: string | null,
  emailSent: boolean
): Promise<{ signalsWritten: number; backtestsWritten: number }> {
  const supabase = createAdminClient();

  // 持仓清单以配置文件为准同步进库(外键要求 signals 先有对应持仓行)
  const holdingRows = holdings.map((h) => ({
    ticker: h.ticker,
    company_name: h.companyName,
    shares: h.shares,
    cost_basis: h.costBasis,
    active: true,
  }));
  {
    const { error } = await supabase.from("portfolio_holdings").upsert(holdingRows, {
      onConflict: "ticker",
    });
    if (error) throw new Error(`写入 portfolio_holdings 失败: ${error.message}`);
  }

  // 幂等:先删除当天旧信号再插入,方便重复手动运行做测试
  await supabase.from("portfolio_signal").delete().eq("report_date", reportDate);

  const signalRows = signals.map((s) => ({
    report_date: reportDate,
    ticker: s.ticker,
    price: s.indicators.price,
    change_pct_1d: s.indicators.changePct1d != null ? Number(s.indicators.changePct1d.toFixed(2)) : null,
    relative_volume:
      s.indicators.relativeVolume != null ? Number(s.indicators.relativeVolume.toFixed(2)) : null,
    sma50: s.indicators.sma50 != null ? Number(s.indicators.sma50.toFixed(2)) : null,
    sma200: s.indicators.sma200 != null ? Number(s.indicators.sma200.toFixed(2)) : null,
    trend_state: s.indicators.trendState,
    momentum_12_1: s.indicators.momentum != null ? Number(s.indicators.momentum.toFixed(2)) : null,
    momentum_rank: s.decision.momentumRank,
    rsi14: s.indicators.rsi14 != null ? Number(s.indicators.rsi14.toFixed(1)) : null,
    drawdown_pct: s.indicators.drawdownPct != null ? Number(s.indicators.drawdownPct.toFixed(2)) : null,
    action: s.decision.action,
    action_reasons: s.decision.reasons,
    alert_flag: s.decision.alertFlag,
  }));
  if (signalRows.length > 0) {
    const { error } = await supabase.from("portfolio_signal").upsert(signalRows, {
      onConflict: "report_date,ticker",
    });
    if (error) throw new Error(`写入 portfolio_signal 失败: ${error.message}`);
  }

  const totalAlerts = signals.filter((s) => s.decision.alertFlag).length;
  {
    const { error } = await supabase.from("portfolio_snapshot").upsert(
      {
        report_date: reportDate,
        total_alerts: totalAlerts,
        commentary_md: commentaryMd,
        rotation_md: rotationMd,
        email_sent: emailSent,
      },
      { onConflict: "report_date" }
    );
    if (error) throw new Error(`写入 portfolio_snapshot 失败: ${error.message}`);
  }

  const backtestRows = backtests.map((b) => ({
    ticker: b.ticker,
    strategy: b.strategy,
    start_date: b.stats.startDate,
    end_date: b.stats.endDate,
    cagr_pct: b.stats.cagrPct,
    max_drawdown_pct: b.stats.maxDrawdownPct,
    volatility_pct: b.stats.volatilityPct,
    sharpe: b.stats.sharpe,
    trade_count: b.stats.tradeCount,
    updated_at: new Date().toISOString(),
  }));
  if (backtestRows.length > 0) {
    const { error } = await supabase.from("portfolio_backtest").upsert(backtestRows, {
      onConflict: "ticker,strategy",
    });
    if (error) throw new Error(`写入 portfolio_backtest 失败: ${error.message}`);
  }

  console.log(
    `[writePortfolioToDb] 完成:portfolio_signal=${signalRows.length} portfolio_backtest=${backtestRows.length} 预警=${totalAlerts}`
  );
  return { signalsWritten: signalRows.length, backtestsWritten: backtestRows.length };
}

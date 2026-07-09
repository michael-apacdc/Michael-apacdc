// 回测引擎:用和信号引擎同一套指标函数,在历史日线上模拟三个策略:
//   buy_hold          买入持有(基准)
//   trend_200         200日均线趋势过滤:收盘在200日线上方持有,下方空仓
//   momentum_rotation 组合层面动量轮动:每月按12-1动量排名,等权持有前N名
// 关键防偏差处理:信号用第t天收盘价计算,仓位从第t+1天的收益开始生效(避免未来函数)。
// 未计入交易成本和税——趋势/轮动策略换手不高,但真实收益会比回测略低,页面上会如实标注。

import type { DailyBar } from "./marketData";
import { momentum12_1, sma } from "./portfolioSignals";

export interface BacktestStats {
  cagrPct: number | null;
  maxDrawdownPct: number | null;
  volatilityPct: number | null;
  sharpe: number | null;
  tradeCount: number;
  startDate: string;
  endDate: string;
}

const TRADING_DAYS_PER_YEAR = 252;

/** 从每日净值曲线算 CAGR / 最大回撤 / 年化波动率 / 夏普(无风险利率按0)。 */
function computeStats(
  equity: number[],
  startDate: string,
  endDate: string,
  tradeCount: number
): BacktestStats {
  if (equity.length < 2) {
    return {
      cagrPct: null,
      maxDrawdownPct: null,
      volatilityPct: null,
      sharpe: null,
      tradeCount,
      startDate,
      endDate,
    };
  }

  const years = (equity.length - 1) / TRADING_DAYS_PER_YEAR;
  const totalReturn = equity[equity.length - 1] / equity[0];
  const cagrPct = years > 0 ? (Math.pow(totalReturn, 1 / years) - 1) * 100 : null;

  let peak = equity[0];
  let maxDrawdown = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }

  const dailyReturns: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    dailyReturns.push(equity[i] / equity[i - 1] - 1);
  }
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((a, b) => a + (b - mean) * (b - mean), 0) / dailyReturns.length;
  const dailyVol = Math.sqrt(variance);
  const volatilityPct = dailyVol * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
  const sharpe =
    dailyVol > 0 ? (mean * TRADING_DAYS_PER_YEAR) / (dailyVol * Math.sqrt(TRADING_DAYS_PER_YEAR)) : null;

  return {
    cagrPct: cagrPct != null ? Number(cagrPct.toFixed(2)) : null,
    maxDrawdownPct: Number((maxDrawdown * 100).toFixed(2)),
    volatilityPct: Number(volatilityPct.toFixed(2)),
    sharpe: sharpe != null ? Number(sharpe.toFixed(2)) : null,
    tradeCount,
    startDate,
    endDate,
  };
}

/** 买入持有基准。 */
export function backtestBuyHold(bars: DailyBar[]): BacktestStats {
  const equity = bars.map((b) => b.adjClose / bars[0].adjClose);
  return computeStats(equity, bars[0].date, bars[bars.length - 1].date, 0);
}

/** 200日均线趋势过滤:第t天收盘判断,第t+1天生效;空仓期收益为0(现金,不计利息)。 */
export function backtestTrend200(bars: DailyBar[]): BacktestStats {
  const adj = bars.map((b) => b.adjClose);
  // 需要200天算出第一个信号,从第200根K线开始回测
  const startIdx = 200;
  if (bars.length <= startIdx + 1) {
    return computeStats([], bars[0]?.date ?? "", bars[bars.length - 1]?.date ?? "", 0);
  }

  const equity: number[] = [1];
  let position = adj[startIdx] > (sma(adj, 200, startIdx) ?? Infinity) ? 1 : 0;
  let tradeCount = 0;

  for (let t = startIdx + 1; t < bars.length; t++) {
    const dailyReturn = adj[t] / adj[t - 1] - 1;
    equity.push(equity[equity.length - 1] * (1 + position * dailyReturn));

    // 用今天收盘更新明天的仓位
    const sma200 = sma(adj, 200, t);
    const newPosition = sma200 != null && adj[t] > sma200 ? 1 : 0;
    if (newPosition !== position) tradeCount++;
    position = newPosition;
  }

  return computeStats(equity, bars[startIdx].date, bars[bars.length - 1].date, tradeCount);
}

/**
 * 组合层面动量轮动:对齐全部持仓的交易日,每21个交易日(约每月)按12-1动量重排,
 * 等权持有排名前 topN 的持仓;动量数据不足的标的不参与。返回轮动策略与等权买入持有基准。
 */
export function backtestMomentumRotation(
  barsByTicker: Map<string, DailyBar[]>,
  topN: number
): { rotation: BacktestStats; equalWeightBuyHold: BacktestStats } | null {
  const tickers = [...barsByTicker.keys()];
  if (tickers.length < 2) return null;

  // 对齐:只保留所有持仓都有数据的交易日
  const dateSets = tickers.map((t) => new Set(barsByTicker.get(t)!.map((b) => b.date)));
  const commonDates = [...dateSets[0]]
    .filter((d) => dateSets.every((s) => s.has(d)))
    .sort();
  if (commonDates.length < 300) return null; // 不足以算12个月动量+有意义的回测区间

  const priceMatrix = new Map<string, number[]>(); // ticker -> 对齐后的adjClose序列
  for (const t of tickers) {
    const byDate = new Map(barsByTicker.get(t)!.map((b) => [b.date, b.adjClose]));
    priceMatrix.set(t, commonDates.map((d) => byDate.get(d)!));
  }

  const startIdx = 252; // 第一个12-1动量需要252个交易日
  const rebalanceEvery = 21;

  let weights = new Map<string, number>();
  let tradeCount = 0;

  function rebalance(atIdx: number): void {
    const scored = tickers
      .map((t) => ({ t, m: momentum12_1(priceMatrix.get(t)!, atIdx) }))
      .filter((x): x is { t: string; m: number } => x.m != null)
      .sort((a, b) => b.m - a.m);
    const selected = scored.slice(0, topN).map((x) => x.t);
    const newWeights = new Map<string, number>(
      selected.map((t) => [t, 1 / Math.max(selected.length, 1)])
    );
    // 换仓计数:持有集合发生变化算一次
    const oldSet = [...weights.keys()].sort().join(",");
    const newSet = [...newWeights.keys()].sort().join(",");
    if (oldSet !== newSet && oldSet !== "") tradeCount++;
    weights = newWeights;
  }

  rebalance(startIdx);

  const rotationEquity: number[] = [1];
  const buyHoldEquity: number[] = [1];

  for (let i = startIdx + 1; i < commonDates.length; i++) {
    // 轮动组合当日收益(用前一天定下的权重)
    let dayReturn = 0;
    for (const [t, w] of weights) {
      const series = priceMatrix.get(t)!;
      dayReturn += w * (series[i] / series[i - 1] - 1);
    }
    rotationEquity.push(rotationEquity[rotationEquity.length - 1] * (1 + dayReturn));

    // 等权买入持有基准
    let bhReturn = 0;
    for (const t of tickers) {
      const series = priceMatrix.get(t)!;
      bhReturn += (1 / tickers.length) * (series[i] / series[i - 1] - 1);
    }
    buyHoldEquity.push(buyHoldEquity[buyHoldEquity.length - 1] * (1 + bhReturn));

    if ((i - startIdx) % rebalanceEvery === 0) rebalance(i);
  }

  const startDate = commonDates[startIdx];
  const endDate = commonDates[commonDates.length - 1];
  return {
    rotation: computeStats(rotationEquity, startDate, endDate, tradeCount),
    equalWeightBuyHold: computeStats(buyHoldEquity, startDate, endDate, 0),
  };
}

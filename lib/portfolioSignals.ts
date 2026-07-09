// 持仓信号引擎:全部是对日线数组的纯函数计算,不调用网络、不依赖AI。
// 每日流水线和回测引擎(lib/backtest.ts)复用同一套函数 —— 保证回测验证的规则
// 和线上每天跑的规则是同一份代码。
// 指标口径:动量/均线/RSI/回撤一律用复权收盘价(adjClose)。

import type { DailyBar } from "./marketData";
import type { PortfolioAction } from "./types";

export interface PortfolioRules {
  drawdownAlertPct: number; // 负数,如 -15
  rsiOverbought: number;
  rsiOversold: number;
  dailyMoveAlertPct: number;
  relativeVolumeAlert: number;
  rotationTopN: number;
}

// ---------- 基础指标 ----------

/** 简单移动平均,endIdx 为窗口最后一根K线的下标(含)。数据不足返回 null。 */
export function sma(values: number[], period: number, endIdx: number): number | null {
  if (endIdx + 1 < period) return null;
  let sum = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i++) sum += values[i];
  return sum / period;
}

/** Wilder RSI(14),数据不足返回 null。 */
export function rsi(values: number[], period: number, endIdx: number): number | null {
  if (endIdx < period) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i <= endIdx; i++) {
    const diff = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** 12-1月动量:t-252 到 t-21 的涨跌幅(%)。剔除最近一个月是动量研究的标准做法(避开短期反转)。 */
export function momentum12_1(values: number[], endIdx: number): number | null {
  const skip = 21;
  const lookback = 252;
  if (endIdx < lookback) return null;
  const recent = values[endIdx - skip];
  const past = values[endIdx - lookback];
  if (!past || !recent) return null;
  return ((recent - past) / past) * 100;
}

/** 相对52周(252个交易日)最高收盘价的回撤,%(负数或0)。 */
export function drawdownFrom52wHigh(values: number[], endIdx: number): number | null {
  const start = Math.max(0, endIdx - 251);
  let high = -Infinity;
  for (let i = start; i <= endIdx; i++) if (values[i] > high) high = values[i];
  if (!isFinite(high) || high <= 0) return null;
  return ((values[endIdx] - high) / high) * 100;
}

// ---------- 单支持仓的指标快照 ----------

export interface HoldingIndicators {
  price: number | null; // 原始收盘价,展示用
  changePct1d: number | null;
  relativeVolume: number | null;
  sma50: number | null;
  sma200: number | null;
  trendState: "above_200" | "below_200" | "unknown";
  momentum: number | null; // 12-1月动量 %
  rsi14: number | null;
  drawdownPct: number | null;
  // 事件型信号(今天刚发生的状态切换,只在切换当天为 true)
  crossedBelow200: boolean;
  crossedAbove200: boolean;
  goldenCross: boolean;
  deathCross: boolean;
}

/** 在 bars 的 endIdx 位置计算全套指标。endIdx 默认为最后一根K线。 */
export function computeIndicators(bars: DailyBar[], endIdx = bars.length - 1): HoldingIndicators {
  const adj = bars.map((b) => b.adjClose);
  const i = endIdx;

  const sma50Now = sma(adj, 50, i);
  const sma200Now = sma(adj, 200, i);
  const sma50Prev = sma(adj, 50, i - 1);
  const sma200Prev = sma(adj, 200, i - 1);

  const priceNow = adj[i];
  const pricePrev = i >= 1 ? adj[i - 1] : null;

  let trendState: HoldingIndicators["trendState"] = "unknown";
  if (sma200Now != null) trendState = priceNow > sma200Now ? "above_200" : "below_200";

  const crossedBelow200 =
    sma200Now != null && sma200Prev != null && pricePrev != null
      ? pricePrev > sma200Prev && priceNow <= sma200Now
      : false;
  const crossedAbove200 =
    sma200Now != null && sma200Prev != null && pricePrev != null
      ? pricePrev <= sma200Prev && priceNow > sma200Now
      : false;
  const goldenCross =
    sma50Now != null && sma200Now != null && sma50Prev != null && sma200Prev != null
      ? sma50Prev <= sma200Prev && sma50Now > sma200Now
      : false;
  const deathCross =
    sma50Now != null && sma200Now != null && sma50Prev != null && sma200Prev != null
      ? sma50Prev >= sma200Prev && sma50Now < sma200Now
      : false;

  const changePct1d =
    pricePrev != null && pricePrev !== 0 ? ((priceNow - pricePrev) / pricePrev) * 100 : null;

  // 相对成交量:今日 / 前20日均量(不含今日,避免盘中未收盘时今日量偏低拉低均值)
  let relativeVolume: number | null = null;
  if (i >= 20) {
    const window = bars.slice(i - 20, i).map((b) => b.volume).filter((v): v is number => v != null);
    const todayVol = bars[i].volume;
    if (window.length > 0 && todayVol != null) {
      const avg = window.reduce((a, b) => a + b, 0) / window.length;
      if (avg > 0) relativeVolume = todayVol / avg;
    }
  }

  return {
    price: bars[i].close,
    changePct1d,
    relativeVolume,
    sma50: sma50Now,
    sma200: sma200Now,
    trendState,
    momentum: momentum12_1(adj, i),
    rsi14: rsi(adj, 14, i),
    drawdownPct: drawdownFrom52wHigh(adj, i),
    crossedBelow200,
    crossedAbove200,
    goldenCross,
    deathCross,
  };
}

// ---------- 动量排名 + 行动建议 ----------

export interface HoldingDecision {
  action: PortfolioAction;
  reasons: string[];
  alertFlag: boolean;
  momentumRank: number | null; // 1 = 动量最强
}

/**
 * 给一组持仓的指标快照打动量排名并产出行动建议。
 * 积极(动量轮动)风格:
 *  - 风险规则优先(回撤止损线、跌破200日线、死叉)→ sell/trim
 *  - 动量排名前 rotationTopN 且趋势健康 → add(轮动超配)
 *  - 动量排名垫底且动量为负 → trim(轮动减配)
 *  - RSI 极值、单日暴动、放量 → watch 提示
 */
export function decideActions(
  indicators: Map<string, HoldingIndicators>,
  rules: PortfolioRules
): Map<string, HoldingDecision> {
  // 动量排名(动量为 null 的排最后)
  const ranked = [...indicators.entries()]
    .filter(([, ind]) => ind.momentum != null)
    .sort((a, b) => (b[1].momentum ?? 0) - (a[1].momentum ?? 0));
  const rankByTicker = new Map<string, number>(ranked.map(([t], idx) => [t, idx + 1]));
  const rankedCount = ranked.length;

  const out = new Map<string, HoldingDecision>();
  for (const [ticker, ind] of indicators) {
    const reasons: string[] = [];
    const rank = rankByTicker.get(ticker) ?? null;
    let action: PortfolioAction = "hold";

    // --- 风险规则(优先级最高) ---
    if (ind.drawdownPct != null && ind.drawdownPct <= rules.drawdownAlertPct) {
      action = "sell";
      reasons.push(
        `从52周高点回撤${ind.drawdownPct.toFixed(1)}%,触发${rules.drawdownAlertPct}%止损预警线`
      );
    }
    if (ind.deathCross) {
      action = "sell";
      reasons.push("50日均线下穿200日均线(死叉),中期趋势转弱");
    }
    if (ind.crossedBelow200) {
      if (action === "hold") action = "trim";
      reasons.push("今日跌破200日均线,趋势过滤器提示减仓");
    }

    // --- 动量轮动规则 ---
    if (action === "hold" && rank != null && rankedCount >= 2) {
      if (rank <= rules.rotationTopN && ind.trendState === "above_200" && (ind.momentum ?? 0) > 0) {
        action = "add";
        reasons.push(
          `12-1月动量${ind.momentum!.toFixed(1)}%,持仓中排名第${rank},趋势在200日线上方,轮动建议超配`
        );
      } else if (rank === rankedCount && (ind.momentum ?? 0) < 0) {
        action = "trim";
        reasons.push(
          `12-1月动量${ind.momentum!.toFixed(1)}%为负且在持仓中垫底,轮动建议减配换入强势持仓`
        );
      }
    }
    if (ind.crossedAbove200 && action === "hold") {
      action = "add";
      reasons.push("今日站回200日均线上方,趋势转强");
    }
    if (ind.goldenCross) {
      if (action === "hold") action = "add";
      reasons.push("50日均线上穿200日均线(金叉)");
    }

    // --- 提示型信号(不改变买卖方向,只提醒关注) ---
    if (ind.rsi14 != null && ind.rsi14 >= rules.rsiOverbought) {
      if (action === "hold") action = "watch";
      reasons.push(`RSI14=${ind.rsi14.toFixed(0)},进入超买区,短期追高需谨慎`);
    }
    if (ind.rsi14 != null && ind.rsi14 <= rules.rsiOversold) {
      if (action === "hold") action = "watch";
      reasons.push(`RSI14=${ind.rsi14.toFixed(0)},进入超卖区`);
    }
    if (ind.changePct1d != null && Math.abs(ind.changePct1d) > rules.dailyMoveAlertPct) {
      if (action === "hold") action = "watch";
      reasons.push(`单日涨跌${ind.changePct1d.toFixed(1)}%,波动异常`);
    }
    if (ind.relativeVolume != null && ind.relativeVolume > rules.relativeVolumeAlert) {
      if (action === "hold") action = "watch";
      reasons.push(`成交量是20日均量的${ind.relativeVolume.toFixed(1)}倍,明显放量`);
    }

    out.set(ticker, {
      action,
      reasons,
      alertFlag: action !== "hold",
      momentumRank: rank,
    });
  }
  return out;
}

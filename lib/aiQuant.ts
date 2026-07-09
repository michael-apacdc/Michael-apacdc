// AI板块横截面相对强弱模型 —— 核心因子引擎。
// 思路:AI股同涨同跌、板块贝塔极强,单股择时很难;真正可预测性更强的是
// "板块内部的相对强弱"。本模型每天对股票池做多因子打分,预测未来5个交易日
// 相对等权AI板块的超额收益,输出强弱排名。
// 研究脚本(样本外验证)和每日生产流水线共用这一份代码,保证"验证的就是上线的"。
// 全部指标基于复权收盘价与成交量,纯数学计算,不经过AI。

import type { DailyBar } from "./marketData";

// ---------- 对齐的数据矩阵 ----------

export interface AlignedData {
  dates: string[]; // 升序交易日(全部股票日期的并集)
  tickers: string[];
  adj: (number | null)[][]; // [tickerIdx][dateIdx] 复权收盘价
  volume: (number | null)[][];
}

export function buildAligned(barsByTicker: Map<string, DailyBar[]>): AlignedData {
  const tickers = [...barsByTicker.keys()];
  const dateSet = new Set<string>();
  for (const bars of barsByTicker.values()) for (const b of bars) dateSet.add(b.date);
  const dates = [...dateSet].sort();
  const dateIdx = new Map(dates.map((d, i) => [d, i]));

  const adj: (number | null)[][] = tickers.map(() => new Array(dates.length).fill(null));
  const volume: (number | null)[][] = tickers.map(() => new Array(dates.length).fill(null));
  tickers.forEach((t, ti) => {
    for (const b of barsByTicker.get(t)!) {
      const di = dateIdx.get(b.date)!;
      adj[ti][di] = b.adjClose;
      volume[ti][di] = b.volume;
    }
  });
  return { dates, tickers, adj, volume };
}

/** 股票 ti 从 fromIdx 到 toIdx 的累计收益(两端都要有价格,中间的null用前值填充逻辑不需要——只用两端)。 */
function cumReturn(series: (number | null)[], fromIdx: number, toIdx: number): number | null {
  const a = series[fromIdx];
  const b = series[toIdx];
  if (a == null || b == null || a <= 0) return null;
  return b / a - 1;
}

/** 等权板块从 fromIdx 到 toIdx 的累计收益(对两端都有价的成员取平均)。 */
export function basketReturn(data: AlignedData, fromIdx: number, toIdx: number): number | null {
  const rets: number[] = [];
  for (let ti = 0; ti < data.tickers.length; ti++) {
    const r = cumReturn(data.adj[ti], fromIdx, toIdx);
    if (r != null) rets.push(r);
  }
  if (rets.length < 5) return null; // 成员太少不成板块
  return rets.reduce((a, b) => a + b, 0) / rets.length;
}

/** 股票相对板块的超额收益。 */
function excessReturn(
  data: AlignedData,
  ti: number,
  fromIdx: number,
  toIdx: number
): number | null {
  const r = cumReturn(data.adj[ti], fromIdx, toIdx);
  const b = basketReturn(data, fromIdx, toIdx);
  if (r == null || b == null) return null;
  return r - b;
}

// ---------- 因子定义 ----------
// 每个因子:在日期 t 对股票 ti 产出一个原始值(越大=越看多),数据不足返回 null。

export type FactorName =
  | "resid_mom" // 残差动量:60日相对板块超额收益(剔除最近5日,避开短期反转污染)
  | "reversal" // 短期反转:最近5日相对板块超额收益取负(超跌的反弹倾向)
  | "mom_120" // 中期动量:120日相对板块超额收益(剔除最近10日)
  | "prox_high" // 52周高点接近度:现价/252日最高价(强者恒强/突破倾向)
  | "vol_trend" // 量能趋势:log(5日均量/60日均量),资金关注度上升
  | "low_vol"; // 低波动:20日已实现波动率取负(高波动的博彩型股票长期跑输)

export const ALL_FACTORS: FactorName[] = [
  "resid_mom",
  "reversal",
  "mom_120",
  "prox_high",
  "vol_trend",
  "low_vol",
];

export function factorValue(
  data: AlignedData,
  factor: FactorName,
  ti: number,
  t: number
): number | null {
  const adj = data.adj[ti];
  switch (factor) {
    case "resid_mom": {
      if (t < 60) return null;
      return excessReturn(data, ti, t - 60, t - 5);
    }
    case "reversal": {
      if (t < 5) return null;
      const e = excessReturn(data, ti, t - 5, t);
      return e == null ? null : -e;
    }
    case "mom_120": {
      if (t < 120) return null;
      return excessReturn(data, ti, t - 120, t - 10);
    }
    case "prox_high": {
      if (t < 251 || adj[t] == null) return null;
      let high = -Infinity;
      for (let i = t - 251; i <= t; i++) {
        const v = adj[i];
        if (v != null && v > high) high = v;
      }
      if (!isFinite(high) || high <= 0) return null;
      return (adj[t] as number) / high;
    }
    case "vol_trend": {
      if (t < 60) return null;
      const vols = data.volume[ti];
      const avg = (from: number, to: number): number | null => {
        const xs: number[] = [];
        for (let i = from; i <= to; i++) if (vols[i] != null) xs.push(vols[i] as number);
        return xs.length >= Math.floor((to - from + 1) * 0.6)
          ? xs.reduce((a, b) => a + b, 0) / xs.length
          : null;
      };
      const v5 = avg(t - 4, t);
      const v60 = avg(t - 59, t);
      if (v5 == null || v60 == null || v60 <= 0 || v5 <= 0) return null;
      return Math.log(v5 / v60);
    }
    case "low_vol": {
      if (t < 21) return null;
      const rets: number[] = [];
      for (let i = t - 19; i <= t; i++) {
        const a = adj[i - 1];
        const b = adj[i];
        if (a != null && b != null && a > 0) rets.push(b / a - 1);
      }
      if (rets.length < 15) return null;
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
      return -Math.sqrt(variance);
    }
  }
}

// ---------- 横截面标准化与合成 ----------

/** 对一组原始因子值做横截面 z-score,±3截尾。null 保持 null。 */
export function crossSectionalZ(values: (number | null)[]): (number | null)[] {
  const xs = values.filter((v): v is number => v != null);
  if (xs.length < 5) return values.map(() => null);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  if (sd === 0) return values.map((v) => (v == null ? null : 0));
  return values.map((v) => {
    if (v == null) return null;
    const z = (v - mean) / sd;
    return Math.max(-3, Math.min(3, z));
  });
}

export type FactorWeights = Record<FactorName, number>;

// 生产不使用固定权重:每天用 estimateWeights() 从最近约3年数据自动重估
// (固定权重版本在样本外验证中不达标,已弃用;滚动检验详见 supabase 里的 ai_quant_validation 表)。

export interface DailyScore {
  ticker: string;
  score: number | null; // 合成得分(横截面可比)
  rank: number | null; // 1 = 最强
  factorZ: Partial<Record<FactorName, number | null>>;
}

/** 在日期下标 t 计算全池得分与排名。weights 为各因子权重。 */
export function scoreDate(
  data: AlignedData,
  t: number,
  weights: FactorWeights
): DailyScore[] {
  const activeFactors = ALL_FACTORS.filter((f) => weights[f] !== 0);
  const zByFactor = new Map<FactorName, (number | null)[]>();
  for (const f of activeFactors) {
    const raw = data.tickers.map((_, ti) => factorValue(data, f, ti, t));
    zByFactor.set(f, crossSectionalZ(raw));
  }

  const scores: DailyScore[] = data.tickers.map((ticker, ti) => {
    let sum = 0;
    let weightUsed = 0;
    const factorZ: Partial<Record<FactorName, number | null>> = {};
    for (const f of activeFactors) {
      const z = zByFactor.get(f)![ti];
      factorZ[f] = z;
      if (z != null) {
        sum += weights[f] * z;
        weightUsed += Math.abs(weights[f]);
      }
    }
    // 要求至少一半权重的因子有值,否则不给分(新股数据不足时自动出局)
    const totalWeight = activeFactors.reduce((a, f) => a + Math.abs(weights[f]), 0);
    const score = weightUsed >= totalWeight * 0.5 && weightUsed > 0 ? sum / weightUsed : null;
    return { ticker, score, rank: null, factorZ };
  });

  const ranked = scores
    .filter((s) => s.score != null)
    .sort((a, b) => (b.score as number) - (a.score as number));
  ranked.forEach((s, i) => (s.rank = i + 1));
  return scores;
}

// ---------- 评估工具(研究与滚动自检共用) ----------

/** 未来 horizon 个交易日相对板块的超额收益。 */
export function forwardExcess(
  data: AlignedData,
  ti: number,
  t: number,
  horizon: number
): number | null {
  if (t + horizon >= data.dates.length) return null;
  return excessReturn(data, ti, t, t + horizon);
}

// ---------- 生产用:自适应权重估计 + 选股(与滚动季度检验完全同一套逻辑) ----------

export const PRODUCTION_PARAMS = {
  horizon: 5, // 预测/持有窗口(交易日)
  topN: 5, // 每日强势名单数量
  subsectorCap: 2, // 每个子板块最多入选数(防单板块押注)
  momGateQuantile: 0.25, // 中期动量垫底25%不得入选(不接飞刀)
  weightLookback: 750, // 权重估计回看窗口(交易日,约3年)
  weightTStat: 1.5, // 因子入选的|t|门槛
};

/**
 * 用截至 endIdx(不含)的 trailing 窗口自动估计因子权重:ICIR加权、|t|<门槛置0、绝对值归一。
 * 全程无人工参数——滚动季度检验(2022~2026,216窗口)用的就是这个函数的逻辑。
 */
export function estimateWeights(data: AlignedData, endIdx: number): FactorWeights {
  const H = PRODUCTION_PARAMS.horizon;
  const startIdx = Math.max(260, endIdx - PRODUCTION_PARAMS.weightLookback);
  const icArr = new Map<FactorName, number[]>(ALL_FACTORS.map((f) => [f, []]));
  for (let t = startIdx; t + H < endIdx; t++) {
    const fwd = data.tickers.map((_, ti) => forwardExcess(data, ti, t, H));
    for (const f of ALL_FACTORS) {
      const z = crossSectionalZ(data.tickers.map((_, ti) => factorValue(data, f, ti, t)));
      const ic = spearman(z, fwd);
      if (ic != null) icArr.get(f)!.push(ic);
    }
  }
  const w = {} as FactorWeights;
  let totalAbs = 0;
  for (const f of ALL_FACTORS) {
    const arr = icArr.get(f)!;
    if (arr.length < 100) {
      w[f] = 0;
      continue;
    }
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
    const icir = mean / sd;
    const tstat = icir * Math.sqrt(arr.length);
    w[f] = Math.abs(tstat) >= PRODUCTION_PARAMS.weightTStat ? icir : 0;
    totalAbs += Math.abs(w[f]);
  }
  if (totalAbs === 0) {
    // 极端情况兜底:没有任何因子过门槛时,用研发期最稳的两个等权
    w.reversal = 0.5;
    w.mom_120 = 0.5;
    totalAbs = 1;
  }
  for (const f of ALL_FACTORS) w[f] = w[f] / totalAbs;
  return w;
}

/**
 * 在日期下标 t 产出前 topN 强势名单:动量垫底25%排除(不接飞刀)+ 每子板块最多 subsectorCap 支。
 * subsectorOf: ticker -> 子板块代码。
 */
export function pickTopN(
  data: AlignedData,
  t: number,
  weights: FactorWeights,
  subsectorOf: Map<string, string>
): DailyScore[] {
  let scores = scoreDate(data, t, weights).filter((s) => s.rank != null);
  if (scores.length < 15) return [];
  const momZ = crossSectionalZ(data.tickers.map((_, ti) => factorValue(data, "mom_120", ti, t)));
  const zByTicker = new Map(data.tickers.map((tk, ti) => [tk, momZ[ti]]));
  const valid = scores.filter((s) => (zByTicker.get(s.ticker) ?? null) != null);
  const sorted = [...valid].sort(
    (a, b) => (zByTicker.get(a.ticker)! as number) - (zByTicker.get(b.ticker)! as number)
  );
  const gated = new Set(
    sorted
      .slice(0, Math.floor(sorted.length * PRODUCTION_PARAMS.momGateQuantile))
      .map((s) => s.ticker)
  );
  scores = scores.filter((s) => !gated.has(s.ticker));
  scores.sort((a, b) => (a.rank as number) - (b.rank as number));
  const picks: DailyScore[] = [];
  const perSub = new Map<string, number>();
  for (const s of scores) {
    const sub = subsectorOf.get(s.ticker) ?? "other";
    if ((perSub.get(sub) ?? 0) >= PRODUCTION_PARAMS.subsectorCap) continue;
    picks.push(s);
    perSub.set(sub, (perSub.get(sub) ?? 0) + 1);
    if (picks.length >= PRODUCTION_PARAMS.topN) break;
  }
  return picks;
}

/** Spearman 秩相关(IC 计算用)。 */
export function spearman(xs: (number | null)[], ys: (number | null)[]): number | null {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] != null && ys[i] != null) pairs.push([xs[i] as number, ys[i] as number]);
  }
  if (pairs.length < 8) return null;
  const rank = (arr: number[]): number[] => {
    const idx = arr.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
    const ranks = new Array(arr.length).fill(0);
    idx.forEach(([, orig], r) => (ranks[orig] = r + 1));
    return ranks;
  };
  const rx = rank(pairs.map((p) => p[0]));
  const ry = rank(pairs.map((p) => p[1]));
  const n = pairs.length;
  const mean = (n + 1) / 2;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mean) * (ry[i] - mean);
    dx += (rx[i] - mean) ** 2;
    dy += (ry[i] - mean) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

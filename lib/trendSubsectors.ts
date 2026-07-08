import type { TrendSubsectorCode } from "./types";

export const TREND_SUBSECTOR_NAMES: Record<TrendSubsectorCode, string> = {
  chip: "芯片",
  optical: "光模块",
  datacenter: "数据中心",
  storage: "存储",
  liquid_cooling: "液冷",
  energy: "能源",
};

export const TREND_SUBSECTOR_CODES = Object.keys(TREND_SUBSECTOR_NAMES) as TrendSubsectorCode[];

// 象限分类:横轴是5日动量(当前走势方向),纵轴是相对成交量(资金关注度的免费代理指标)。
// 这是纯数学计算,不涉及AI判断,流水线的Claude叙述和前端象限图共用同一套逻辑,保证口径一致。
export type MoneyFlowQuadrant = "inflow" | "outflow" | "weak_rally" | "quiet";

export const MONEY_FLOW_QUADRANT_LABELS: Record<MoneyFlowQuadrant, string> = {
  inflow: "资金流入 · 强势",
  outflow: "资金流出 · 杀跌",
  weak_rally: "缩量上涨 · 支撑不足",
  quiet: "低迷 · 缺乏关注",
};

export interface SubsectorSignalLike {
  change_pct_1d: number | null;
  change_pct_5d: number | null;
  relative_volume: number | null;
  alert_flag: boolean;
}

export interface SubsectorAggregate {
  subsectorCode: TrendSubsectorCode;
  tickerCount: number;
  alertCount: number;
  avgChangePct1d: number | null;
  avgChangePct5d: number | null;
  avgRelativeVolume: number | null;
  quadrant: MoneyFlowQuadrant;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
}

export function computeSubsectorAggregate(
  subsectorCode: TrendSubsectorCode,
  signals: SubsectorSignalLike[]
): SubsectorAggregate {
  const changePct1dValues = signals.map((s) => s.change_pct_1d).filter((v): v is number => v != null);
  const changePct5dValues = signals.map((s) => s.change_pct_5d).filter((v): v is number => v != null);
  const relativeVolumeValues = signals.map((s) => s.relative_volume).filter((v): v is number => v != null);

  const avgChangePct1d = average(changePct1dValues);
  const avgChangePct5d = average(changePct5dValues);
  const avgRelativeVolume = average(relativeVolumeValues);

  let quadrant: MoneyFlowQuadrant = "quiet";
  if (avgChangePct5d != null && avgRelativeVolume != null) {
    if (avgChangePct5d > 0 && avgRelativeVolume > 1) quadrant = "inflow";
    else if (avgChangePct5d <= 0 && avgRelativeVolume > 1) quadrant = "outflow";
    else if (avgChangePct5d > 0 && avgRelativeVolume <= 1) quadrant = "weak_rally";
    else quadrant = "quiet";
  }

  return {
    subsectorCode,
    tickerCount: signals.length,
    alertCount: signals.filter((s) => s.alert_flag).length,
    avgChangePct1d,
    avgChangePct5d,
    avgRelativeVolume,
    quadrant,
  };
}

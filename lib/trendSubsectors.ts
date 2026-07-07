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

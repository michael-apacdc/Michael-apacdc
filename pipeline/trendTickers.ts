import type { TrendSubsectorCode } from "../lib/types";

export { TREND_SUBSECTOR_NAMES, TREND_SUBSECTOR_CODES } from "../lib/trendSubsectors";

export interface TrendTickerDef {
  ticker: string;
  subsector: TrendSubsectorCode;
  companyName: string;
}

// AI产业细分跟踪个股清单,和 supabase/schema_trend.sql 里 trend_tickers 的初始数据保持一致。
// 增删个股时两边都要改一下。
export const TREND_TICKERS: TrendTickerDef[] = [
  { ticker: "NVDA", subsector: "chip", companyName: "NVIDIA" },
  { ticker: "AMD", subsector: "chip", companyName: "Advanced Micro Devices" },
  { ticker: "AVGO", subsector: "chip", companyName: "Broadcom" },
  { ticker: "TSM", subsector: "chip", companyName: "Taiwan Semiconductor" },
  { ticker: "MRVL", subsector: "chip", companyName: "Marvell Technology" },
  { ticker: "COHR", subsector: "optical", companyName: "Coherent" },
  { ticker: "LITE", subsector: "optical", companyName: "Lumentum" },
  { ticker: "FN", subsector: "optical", companyName: "Fabrinet" },
  { ticker: "CIEN", subsector: "optical", companyName: "Ciena" },
  { ticker: "AAOI", subsector: "optical", companyName: "Applied Optoelectronics" },
  { ticker: "EQIX", subsector: "datacenter", companyName: "Equinix" },
  { ticker: "DLR", subsector: "datacenter", companyName: "Digital Realty" },
  { ticker: "IRM", subsector: "datacenter", companyName: "Iron Mountain" },
  { ticker: "WDC", subsector: "storage", companyName: "Western Digital" },
  { ticker: "STX", subsector: "storage", companyName: "Seagate Technology" },
  { ticker: "PSTG", subsector: "storage", companyName: "Pure Storage" },
  { ticker: "NTAP", subsector: "storage", companyName: "NetApp" },
  { ticker: "MU", subsector: "storage", companyName: "Micron Technology" },
  { ticker: "VRT", subsector: "liquid_cooling", companyName: "Vertiv" },
  { ticker: "NVT", subsector: "liquid_cooling", companyName: "nVent Electric" },
  { ticker: "MOD", subsector: "liquid_cooling", companyName: "Modine Manufacturing" },
  { ticker: "VST", subsector: "energy", companyName: "Vistra" },
  { ticker: "CEG", subsector: "energy", companyName: "Constellation Energy" },
  { ticker: "NEE", subsector: "energy", companyName: "NextEra Energy" },
  { ticker: "NRG", subsector: "energy", companyName: "NRG Energy" },
];

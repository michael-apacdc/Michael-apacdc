import type { RawTrendSignal } from "../lib/types";
import { TREND_TICKERS } from "./trendTickers";

const FMP_BASE = "https://financialmodelingprep.com/stable";
const CHANGE_ALERT_THRESHOLD_PCT = 5; // 单日涨跌幅超过这个百分比触发预警
const RELATIVE_VOLUME_ALERT_THRESHOLD = 2.5; // 成交量超过20日均量的这个倍数触发预警

let requestCount = 0;

async function fmpGet<T>(endpoint: string, params: Record<string, string>, apiKey: string): Promise<T> {
  requestCount += 1;
  const query = new URLSearchParams({ ...params, apikey: apiKey });
  const url = `${FMP_BASE}/${endpoint}?${query.toString()}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok || (body && typeof body === "object" && !Array.isArray(body) && "Error Message" in body)) {
    const message =
      body && typeof body === "object" && "Error Message" in body
        ? (body as { "Error Message": string })["Error Message"]
        : `HTTP ${res.status}`;
    throw new Error(`FMP ${endpoint} 失败: ${message}`);
  }
  return body as T;
}

interface FmpQuote {
  price: number;
  changePercentage: number;
  volume: number;
}

interface FmpHistoricalBar {
  date: string;
  price: number;
  volume: number;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIsoDate(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function fetchOneTicker(
  ticker: string,
  subsector: string,
  companyName: string,
  apiKey: string
): Promise<RawTrendSignal> {
  let price: number | null = null;
  let changePct1d: number | null = null;
  let changePct5d: number | null = null;
  let avgVolume20d: number | null = null;
  let relativeVolume: number | null = null;
  const notes: string[] = [];

  try {
    const quotes = await fmpGet<FmpQuote[]>("quote", { symbol: ticker }, apiKey);
    if (quotes?.[0]) {
      price = quotes[0].price ?? null;
      changePct1d = quotes[0].changePercentage ?? null;
    }
  } catch (err) {
    notes.push(`现价获取失败: ${(err as Error).message}`);
  }

  try {
    const bars = await fmpGet<FmpHistoricalBar[]>(
      "historical-price-eod/light",
      { symbol: ticker, from: daysAgoIsoDate(35), to: todayIsoDate() },
      apiKey
    );
    const sorted = [...(bars ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1)); // 最新在前
    if (sorted.length >= 6) {
      const latestClose = sorted[0].price;
      const fiveDaysAgoClose = sorted[5].price;
      if (fiveDaysAgoClose) {
        changePct5d = Number((((latestClose - fiveDaysAgoClose) / fiveDaysAgoClose) * 100).toFixed(2));
      }
    }
    const volumeWindow = sorted.slice(0, 20).map((b) => b.volume).filter((v) => typeof v === "number");
    if (volumeWindow.length > 0) {
      avgVolume20d = Math.round(volumeWindow.reduce((a, b) => a + b, 0) / volumeWindow.length);
      const todayVolume = sorted[0]?.volume;
      if (todayVolume && avgVolume20d > 0) {
        relativeVolume = Number((todayVolume / avgVolume20d).toFixed(2));
      }
    }
  } catch (err) {
    notes.push(`历史价格获取失败: ${(err as Error).message}`);
  }

  let alertFlag = false;
  const alertReasons: string[] = [];
  if (changePct1d != null && Math.abs(changePct1d) > CHANGE_ALERT_THRESHOLD_PCT) {
    alertFlag = true;
    alertReasons.push(`单日涨跌幅${changePct1d.toFixed(1)}%,超过${CHANGE_ALERT_THRESHOLD_PCT}%预警阈值`);
  }
  if (relativeVolume != null && relativeVolume > RELATIVE_VOLUME_ALERT_THRESHOLD) {
    alertFlag = true;
    alertReasons.push(`成交量是20日均量的${relativeVolume.toFixed(1)}倍,明显放量`);
  }

  return {
    ticker,
    subsector_code: subsector as RawTrendSignal["subsector_code"],
    company_name: companyName,
    price,
    change_pct_1d: changePct1d,
    change_pct_5d: changePct5d,
    avg_volume_20d: avgVolume20d,
    relative_volume: relativeVolume,
    alert_flag: alertFlag,
    alert_reason: alertReasons.length > 0 ? alertReasons.join("; ") : notes.length > 0 ? notes.join("; ") : null,
  };
}

export async function fetchAllTrendSignals(): Promise<RawTrendSignal[]> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 FMP_API_KEY 环境变量");
  }

  const results: RawTrendSignal[] = [];
  console.log(`[fetchTrendSignals] 开始抓取 ${TREND_TICKERS.length} 支跟踪个股的价格/成交量信号...`);

  for (const def of TREND_TICKERS) {
    try {
      const signal = await fetchOneTicker(def.ticker, def.subsector, def.companyName, apiKey);
      results.push(signal);
      console.log(
        `[fetchTrendSignals]   ${def.ticker}: 现价=${signal.price ?? "N/A"} 1日=${signal.change_pct_1d ?? "N/A"}% 5日=${signal.change_pct_5d ?? "N/A"}% 相对量=${signal.relative_volume ?? "N/A"}${signal.alert_flag ? " [预警]" : ""}`
      );
    } catch (err) {
      console.warn(`[fetchTrendSignals]   ${def.ticker} 整体抓取失败: ${(err as Error).message}`);
      results.push({
        ticker: def.ticker,
        subsector_code: def.subsector,
        company_name: def.companyName,
        price: null,
        change_pct_1d: null,
        change_pct_5d: null,
        avg_volume_20d: null,
        relative_volume: null,
        alert_flag: false,
        alert_reason: `完全抓取失败: ${(err as Error).message}`,
      });
    }
  }

  console.log(`[fetchTrendSignals] 完成,共发出约 ${requestCount} 次 FMP 请求`);
  return results;
}

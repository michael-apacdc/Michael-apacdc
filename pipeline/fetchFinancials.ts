import type { RawFinancialData } from "../lib/types";
import tickers from "./tickers.json";

// FMP 在 2025年8月31日 停用了旧版 /api/v3/ 端点(路径参数风格),
// 新账号必须用 /stable/ 端点(查询参数风格,ticker 用 ?symbol= 传)。
const FMP_BASE = "https://financialmodelingprep.com/stable";
const DAILY_REQUEST_CAP = 250; // FMP 免费版每日请求上限

let requestCount = 0;

async function fmpGet<T>(
  endpoint: string,
  params: Record<string, string>,
  apiKey: string
): Promise<T | null> {
  requestCount += 1;
  const query = new URLSearchParams({ ...params, apikey: apiKey });
  const url = `${FMP_BASE}/${endpoint}?${query.toString()}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "Error Message" in body
        ? (body as { "Error Message": string })["Error Message"]
        : `HTTP ${res.status}`;
    throw new Error(`FMP ${endpoint} 失败: ${message}`);
  }
  // FMP 出错时有时仍返回 200 但 body 里带 "Error Message"
  if (body && typeof body === "object" && !Array.isArray(body) && "Error Message" in body) {
    throw new Error(`FMP ${endpoint} 失败: ${(body as { "Error Message": string })["Error Message"]}`);
  }
  return body as T;
}

interface FmpQuote {
  symbol: string;
  price: number;
}

interface FmpRatiosTtm {
  priceToEarningsRatioTTM?: number | null;
  // 字段名在 FMP 文档里未完全确认,做多候选兜底
  evToEBITDATTM?: number | null;
  enterpriseValueMultipleTTM?: number | null;
}

interface FmpPriceTargetSummary {
  lastMonthAvgPriceTarget?: number | null;
  lastQuarterAvgPriceTarget?: number | null;
}

async function fetchOneTicker(ticker: string, apiKey: string): Promise<RawFinancialData> {
  const notes: string[] = [];
  let currentPrice: number | null = null;
  let peRatio: number | null = null;
  let evEbitda: number | null = null;
  let targetLow: number | null = null;
  let targetAvg: number | null = null;
  let targetHigh: number | null = null;
  const ratingConsensus: string | null = null; // FMP 免费版暂无独立的分析师评级共识接口

  try {
    const quotes = await fmpGet<FmpQuote[]>("quote", { symbol: ticker }, apiKey);
    if (quotes && quotes[0]) {
      currentPrice = quotes[0].price ?? null;
    }
  } catch (err) {
    notes.push(`现价获取失败: ${(err as Error).message}`);
  }

  try {
    const ratios = await fmpGet<FmpRatiosTtm[]>("ratios-ttm", { symbol: ticker }, apiKey);
    if (ratios && ratios[0]) {
      peRatio = ratios[0].priceToEarningsRatioTTM ?? null;
      evEbitda = ratios[0].evToEBITDATTM ?? ratios[0].enterpriseValueMultipleTTM ?? null;
    }
  } catch (err) {
    notes.push(`估值倍数获取失败: ${(err as Error).message}`);
  }

  // 目标价接口:免费版是否可用未完全确认,优雅降级 —— 失败不影响其他字段
  try {
    const summaries = await fmpGet<FmpPriceTargetSummary[]>(
      "price-target-summary",
      { symbol: ticker },
      apiKey
    );
    const summary = summaries?.[0];
    if (summary) {
      const avg = summary.lastQuarterAvgPriceTarget ?? summary.lastMonthAvgPriceTarget ?? null;
      if (avg != null) {
        targetAvg = avg;
        // FMP 免费版摘要接口不返回高低区间,用 ±10% 近似标注(仅供参考)
        targetLow = Number((avg * 0.9).toFixed(2));
        targetHigh = Number((avg * 1.1).toFixed(2));
        notes.push("目标价高低区间为基于均值的±10%估算,非分析师原始区间");
      }
    }
  } catch (err) {
    notes.push(`目标价接口不可用(可能是付费版功能): ${(err as Error).message}`);
  }

  return {
    ticker,
    current_price: currentPrice,
    currency: "USD",
    pe_ratio: peRatio,
    ev_ebitda: evEbitda,
    target_price_low: targetLow,
    target_price_avg: targetAvg,
    target_price_high: targetHigh,
    analyst_rating_consensus: ratingConsensus,
    data_source_note: notes.length > 0 ? notes.join("; ") : null,
  };
}

export async function fetchAllFinancials(): Promise<RawFinancialData[]> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 FMP_API_KEY 环境变量");
  }

  const results: RawFinancialData[] = [];
  console.log(`[fetchFinancials] 开始抓取 ${tickers.length} 支跟踪个股的金融数据...`);

  for (const t of tickers as { ticker: string }[]) {
    try {
      const data = await fetchOneTicker(t.ticker, apiKey);
      results.push(data);
      console.log(
        `[fetchFinancials]   ${t.ticker}: 现价=${data.current_price ?? "N/A"} PE=${
          data.pe_ratio ?? "N/A"
        } 目标价均值=${data.target_price_avg ?? "N/A"}`
      );
    } catch (err) {
      console.warn(`[fetchFinancials]   ${t.ticker} 整体抓取失败: ${(err as Error).message}`);
      results.push({
        ticker: t.ticker,
        current_price: null,
        currency: "USD",
        pe_ratio: null,
        ev_ebitda: null,
        target_price_low: null,
        target_price_avg: null,
        target_price_high: null,
        analyst_rating_consensus: null,
        data_source_note: `完全抓取失败: ${(err as Error).message}`,
      });
    }
  }

  console.log(
    `[fetchFinancials] 完成,共发出约 ${requestCount} 次 FMP 请求(免费版每日上限 ${DAILY_REQUEST_CAP} 次)`
  );
  return results;
}

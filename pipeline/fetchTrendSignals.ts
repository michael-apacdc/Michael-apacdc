import type { RawTrendSignal } from "../lib/types";
import { TREND_TICKERS } from "./trendTickers";

// Yahoo Finance 的公开图表接口:不需要API key,对中小盘股票也没有"仅开放大盘股"的限制
// (FMP免费版实测只对NVDA/AMD/TSM等极少数大盘股返回数据,其余全部HTTP 402,换成这个)。
// 一次请求同时拿到现价和约1个月的历史K线,比原来调用两个FMP接口更省事。
const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const CHANGE_ALERT_THRESHOLD_PCT = 5; // 单日涨跌幅超过这个百分比触发预警
const RELATIVE_VOLUME_ALERT_THRESHOLD = 2.5; // 成交量超过20日均量的这个倍数触发预警

interface YahooChartResponse {
  chart: {
    result: [
      {
        meta: {
          regularMarketPrice: number;
        };
        timestamp: number[];
        indicators: {
          quote: [
            {
              close: (number | null)[];
              volume: (number | null)[];
            },
          ];
        };
      },
    ] | null;
    error: { code: string; description: string } | null;
  };
}

async function fetchYahooChart(ticker: string): Promise<YahooChartResponse> {
  const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(ticker)}?range=2mo&interval=1d`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
    },
  });
  const body = (await res.json().catch(() => null)) as YahooChartResponse | null;
  if (!res.ok || !body || body.chart.error) {
    const message = body?.chart?.error?.description ?? `HTTP ${res.status}`;
    throw new Error(`Yahoo Finance 获取失败: ${message}`);
  }
  return body;
}

async function fetchOneTicker(
  ticker: string,
  subsector: string,
  companyName: string
): Promise<RawTrendSignal> {
  let price: number | null = null;
  let changePct1d: number | null = null;
  let changePct5d: number | null = null;
  let avgVolume20d: number | null = null;
  let relativeVolume: number | null = null;
  const notes: string[] = [];

  try {
    const data = await fetchYahooChart(ticker);
    const result = data.chart.result?.[0];
    if (!result) throw new Error("返回结果为空");

    const closes = result.indicators.quote[0].close;
    const volumes = result.indicators.quote[0].volume;

    // 过滤掉当天可能存在的 null(盘中/刚收盘时最后一条有时还没有数据)
    const validIdx: number[] = [];
    for (let i = 0; i < closes.length; i++) {
      if (closes[i] != null) validIdx.push(i);
    }

    const latestIdx = validIdx[validIdx.length - 1];
    const latestClose = latestIdx != null ? closes[latestIdx] : null;
    price = result.meta.regularMarketPrice ?? latestClose ?? null;

    // 涨跌幅统一用K线数组本身前后两天算,不要用 meta.previousClose / chartPreviousClose
    // —— chartPreviousClose 是"整个图表区间起始日"的收盘价,不是"昨天",混用会算出离谱的涨跌幅。
    if (validIdx.length >= 2 && latestClose != null) {
      const prevIdx = validIdx[validIdx.length - 2];
      const prevClose = closes[prevIdx];
      if (prevClose) {
        changePct1d = Number((((latestClose - prevClose) / prevClose) * 100).toFixed(2));
      }
    }

    if (validIdx.length >= 6 && latestClose != null) {
      const fiveDaysAgoIdx = validIdx[validIdx.length - 6];
      const fiveDaysAgoClose = closes[fiveDaysAgoIdx];
      if (fiveDaysAgoClose) {
        changePct5d = Number((((latestClose - fiveDaysAgoClose) / fiveDaysAgoClose) * 100).toFixed(2));
      }
    }

    const last20Idx = validIdx.slice(-20);
    const volumeWindow = last20Idx.map((i) => volumes[i]).filter((v): v is number => typeof v === "number");
    if (volumeWindow.length > 0) {
      avgVolume20d = Math.round(volumeWindow.reduce((a, b) => a + b, 0) / volumeWindow.length);
      const todayVolume = latestIdx != null ? volumes[latestIdx] : null;
      if (todayVolume && avgVolume20d > 0) {
        relativeVolume = Number((todayVolume / avgVolume20d).toFixed(2));
      }
    }
  } catch (err) {
    const msg = `获取失败: ${(err as Error).message}`;
    notes.push(msg);
    console.warn(`[fetchTrendSignals]   ${ticker}: ${msg}`);
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
  const results: RawTrendSignal[] = [];
  console.log(`[fetchTrendSignals] 开始抓取 ${TREND_TICKERS.length} 支跟踪个股的价格/成交量信号(数据源:Yahoo Finance)...`);

  for (const [index, def] of TREND_TICKERS.entries()) {
    if (index > 0) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    try {
      const signal = await fetchOneTicker(def.ticker, def.subsector, def.companyName);
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

  console.log(`[fetchTrendSignals] 完成`);
  return results;
}

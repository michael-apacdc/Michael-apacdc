import { classifyMoneyFlowQuadrant, type MoneyFlowQuadrant } from "./trendSubsectors";

// Yahoo Finance 公开图表接口:不需要API key,已在趋势研判模块验证过对中小盘股票也有效。
const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface YahooChartResponse {
  chart: {
    result: [
      {
        meta: { regularMarketPrice: number };
        timestamp: number[];
        indicators: {
          quote: [{ close: (number | null)[]; volume: (number | null)[] }];
        };
      },
    ] | null;
    error: { code: string; description: string } | null;
  };
}

async function fetchYahooChart(ticker: string, range: string): Promise<YahooChartResponse> {
  const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(ticker)}?range=${range}&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as YahooChartResponse | null;
  if (!res.ok || !body || body.chart.error) {
    const message = body?.chart?.error?.description ?? `HTTP ${res.status}`;
    throw new Error(`Yahoo Finance 获取失败: ${message}`);
  }
  return body;
}

export async function fetchYahooPrice(ticker: string): Promise<number | null> {
  try {
    const data = await fetchYahooChart(ticker, "5d");
    return data.chart.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

export interface PriceHistoryPoint {
  date: string;
  close: number;
  volume: number | null;
}

export interface PriceHistoryResult {
  points: PriceHistoryPoint[];
  changePct1d: number | null;
  changePct5d: number | null;
  changePct20d: number | null;
  avgVolume20d: number | null;
  latestVolume: number | null;
  relativeVolume: number | null;
  quadrant: MoneyFlowQuadrant;
}

// 近3个月日线,用于量化分析页面的走势图与"资金整体走势"象限归类,和趋势研判模块用同一套口径(5日动量×相对成交量)。
export async function fetchYahooPriceHistory(ticker: string): Promise<PriceHistoryResult | null> {
  try {
    const data = await fetchYahooChart(ticker, "3mo");
    const result = data.chart.result?.[0];
    if (!result) return null;

    const { timestamp } = result;
    const { close, volume } = result.indicators.quote[0];

    const validIdx: number[] = [];
    for (let i = 0; i < close.length; i++) {
      if (close[i] != null) validIdx.push(i);
    }
    if (validIdx.length === 0) return null;

    const points: PriceHistoryPoint[] = validIdx.map((i) => ({
      date: new Date(timestamp[i] * 1000).toISOString().slice(0, 10),
      close: close[i] as number,
      volume: volume[i] ?? null,
    }));

    const latestIdx = validIdx[validIdx.length - 1];
    const latestClose = close[latestIdx] as number;

    function changeFrom(offset: number): number | null {
      if (validIdx.length <= offset) return null;
      const pastIdx = validIdx[validIdx.length - 1 - offset];
      const pastClose = close[pastIdx];
      if (!pastClose) return null;
      return Number((((latestClose - pastClose) / pastClose) * 100).toFixed(2));
    }

    const changePct1d = changeFrom(1);
    const changePct5d = changeFrom(5);
    const changePct20d = changeFrom(20);

    // 如果最新一根K线就是"今天"(UTC日期),说明美股当天交易可能还没收盘,当天成交量只是盘中累计值,
    // 直接拿去和过去20个完整交易日的均量比会明显偏低、误判为"缩量"。这种情况改用最近一个已收盘的交易日做成交量基准。
    const todayUtc = new Date().toISOString().slice(0, 10);
    const latestIsToday = points[points.length - 1].date === todayUtc;
    const volRefPos = latestIsToday && validIdx.length >= 2 ? validIdx.length - 2 : validIdx.length - 1;
    const volRefIdx = validIdx[volRefPos];

    const volumeWindowIdx = validIdx.slice(Math.max(0, volRefPos - 19), volRefPos + 1);
    const volumeWindow = volumeWindowIdx.map((i) => volume[i]).filter((v): v is number => typeof v === "number");
    const avgVolume20d =
      volumeWindow.length > 0 ? Math.round(volumeWindow.reduce((a, b) => a + b, 0) / volumeWindow.length) : null;
    const latestVolume = volume[volRefIdx] ?? null;
    const relativeVolume =
      latestVolume != null && avgVolume20d && avgVolume20d > 0
        ? Number((latestVolume / avgVolume20d).toFixed(2))
        : null;

    return {
      points,
      changePct1d,
      changePct5d,
      changePct20d,
      avgVolume20d,
      latestVolume,
      relativeVolume,
      quadrant: classifyMoneyFlowQuadrant(changePct5d, relativeVolume),
    };
  } catch {
    return null;
  }
}

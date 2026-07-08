// Yahoo Finance 公开图表接口:不需要API key,已在趋势研判模块验证过对中小盘股票也有效。
const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

interface YahooChartResponse {
  chart: {
    result: [{ meta: { regularMarketPrice: number } }] | null;
    error: { code: string; description: string } | null;
  };
}

export async function fetchYahooPrice(ticker: string): Promise<number | null> {
  const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(ticker)}?range=5d&interval=1d`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as YahooChartResponse | null;
  if (!res.ok || !body || body.chart.error) return null;
  return body.chart.result?.[0]?.meta?.regularMarketPrice ?? null;
}

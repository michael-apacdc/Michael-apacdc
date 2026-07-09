// 持仓量化模块的行情数据层:优先用 Tiingo(付费$10/月,官方SLA、数据更干净),
// 没有配置 TIINGO_API_KEY 时自动降级到 Yahoo Finance 免费图表接口 —— 两条路都返回
// 同样的日线结构,信号引擎和回测不感知数据源差异。
// 回测和动量计算一律用"复权收盘价"(adjusted close,含分红和拆股调整),
// 展示给人看的现价用原始收盘价。

const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const TIINGO_BASE = "https://api.tiingo.com/tiingo/daily";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface DailyBar {
  date: string; // YYYY-MM-DD
  close: number; // 原始收盘价
  adjClose: number; // 复权收盘价
  volume: number | null;
}

interface TiingoPriceRow {
  date: string;
  close: number;
  adjClose: number;
  volume: number | null;
}

async function fetchTiingoHistory(ticker: string, years: number): Promise<DailyBar[]> {
  const apiKey = process.env.TIINGO_API_KEY;
  if (!apiKey) throw new Error("未配置 TIINGO_API_KEY");

  const start = new Date();
  start.setFullYear(start.getFullYear() - years);
  const startDate = start.toISOString().slice(0, 10);

  const url = `${TIINGO_BASE}/${encodeURIComponent(ticker)}/prices?startDate=${startDate}&token=${apiKey}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Tiingo HTTP ${res.status}`);
  const rows = (await res.json()) as TiingoPriceRow[];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Tiingo 返回空数据");

  return rows
    .filter((r) => r.close != null && r.adjClose != null)
    .map((r) => ({
      date: r.date.slice(0, 10),
      close: r.close,
      adjClose: r.adjClose,
      volume: r.volume ?? null,
    }));
}

interface YahooChartResponse {
  chart: {
    result: [
      {
        timestamp: number[];
        indicators: {
          quote: [{ close: (number | null)[]; volume: (number | null)[] }];
          adjclose?: [{ adjclose: (number | null)[] }];
        };
      },
    ] | null;
    error: { code: string; description: string } | null;
  };
}

async function fetchYahooHistory(ticker: string, years: number): Promise<DailyBar[]> {
  const range = `${years}y`;
  const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(ticker)}?range=${range}&interval=1d&includeAdjustedClose=true`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  const body = (await res.json().catch(() => null)) as YahooChartResponse | null;
  if (!res.ok || !body || body.chart.error) {
    const message = body?.chart?.error?.description ?? `HTTP ${res.status}`;
    throw new Error(`Yahoo Finance 获取失败: ${message}`);
  }
  const result = body.chart.result?.[0];
  if (!result) throw new Error("Yahoo 返回结果为空");

  const { timestamp } = result;
  const closes = result.indicators.quote[0].close;
  const volumes = result.indicators.quote[0].volume;
  const adjCloses = result.indicators.adjclose?.[0]?.adjclose ?? closes;

  const bars: DailyBar[] = [];
  for (let i = 0; i < closes.length; i++) {
    const close = closes[i];
    if (close == null) continue;
    bars.push({
      date: new Date(timestamp[i] * 1000).toISOString().slice(0, 10),
      close,
      adjClose: adjCloses[i] ?? close,
      volume: volumes[i] ?? null,
    });
  }
  if (bars.length === 0) throw new Error("Yahoo 返回的K线全部为空");
  return bars;
}

export type MarketDataSource = "tiingo" | "yahoo";

export async function fetchDailyHistory(
  ticker: string,
  years: number
): Promise<{ bars: DailyBar[]; source: MarketDataSource }> {
  if (process.env.TIINGO_API_KEY) {
    try {
      const bars = await fetchTiingoHistory(ticker, years);
      return { bars, source: "tiingo" };
    } catch (err) {
      console.warn(`[marketData] ${ticker}: Tiingo 失败(${(err as Error).message}),降级到 Yahoo`);
    }
  }
  const bars = await fetchYahooHistory(ticker, years);
  return { bars, source: "yahoo" };
}

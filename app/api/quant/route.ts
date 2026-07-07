import { NextRequest, NextResponse } from "next/server";
import { computeFScore, computeZScore, type AnnualFinancials } from "@/lib/quant";

const FMP_BASE = "https://financialmodelingprep.com/stable";

async function fmpGet<T>(endpoint: string, params: Record<string, string>, apiKey: string): Promise<T> {
  const query = new URLSearchParams({ ...params, apikey: apiKey });
  const url = `${FMP_BASE}/${endpoint}?${query.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
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
  symbol: string;
  companyName?: string;
  name?: string;
  price: number;
  marketCap: number;
}

interface FmpIncomeStatement {
  date: string;
  fiscalYear?: string;
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  weightedAverageShsOut: number;
}

interface FmpBalanceSheet {
  date: string;
  totalAssets: number;
  totalCurrentAssets: number;
  totalCurrentLiabilities: number;
  totalLiabilities: number;
  retainedEarnings: number;
  longTermDebt: number;
}

interface FmpCashFlow {
  date: string;
  operatingCashFlow: number;
}

interface FmpRatiosTtm {
  priceToEarningsRatioTTM?: number | null;
  priceToBookRatioTTM?: number | null;
  enterpriseValueMultipleTTM?: number | null;
}

function toAnnualFinancials(
  income: FmpIncomeStatement,
  balance: FmpBalanceSheet,
  cashFlow: FmpCashFlow
): AnnualFinancials {
  return {
    fiscalYear: income.fiscalYear ?? income.date?.slice(0, 4) ?? "N/A",
    revenue: income.revenue ?? 0,
    netIncome: income.netIncome ?? 0,
    grossProfit: income.grossProfit ?? 0,
    ebit: income.operatingIncome ?? 0,
    totalAssets: balance.totalAssets ?? 0,
    totalCurrentAssets: balance.totalCurrentAssets ?? 0,
    totalCurrentLiabilities: balance.totalCurrentLiabilities ?? 0,
    totalLiabilities: balance.totalLiabilities ?? 0,
    retainedEarnings: balance.retainedEarnings ?? 0,
    longTermDebt: balance.longTermDebt ?? 0,
    sharesOutstanding: income.weightedAverageShsOut ?? 0,
    operatingCashFlow: cashFlow.operatingCashFlow ?? 0,
  };
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: "请提供 symbol 参数" }, { status: 400 });
  }

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "服务器未配置 FMP_API_KEY" }, { status: 500 });
  }

  try {
    const [quotes, incomeStatements, balanceSheets, cashFlows, ratios] = await Promise.all([
      fmpGet<FmpQuote[]>("quote", { symbol }, apiKey),
      fmpGet<FmpIncomeStatement[]>("income-statement", { symbol, period: "annual", limit: "2" }, apiKey),
      fmpGet<FmpBalanceSheet[]>(
        "balance-sheet-statement",
        { symbol, period: "annual", limit: "2" },
        apiKey
      ),
      fmpGet<FmpCashFlow[]>("cash-flow-statement", { symbol, period: "annual", limit: "2" }, apiKey),
      fmpGet<FmpRatiosTtm[]>("ratios-ttm", { symbol }, apiKey),
    ]);

    const quote = quotes?.[0];
    if (!quote) {
      return NextResponse.json({ error: `找不到股票代码 ${symbol}` }, { status: 404 });
    }
    if (incomeStatements.length < 2 || balanceSheets.length < 2 || cashFlows.length < 2) {
      return NextResponse.json(
        { error: `${symbol} 的历史财务报表数据不足两个财年,无法计算需要同比对比的量化评分` },
        { status: 422 }
      );
    }

    const current = toAnnualFinancials(incomeStatements[0], balanceSheets[0], cashFlows[0]);
    const prior = toAnnualFinancials(incomeStatements[1], balanceSheets[1], cashFlows[1]);

    const fScore = computeFScore(current, prior);
    const zScore = computeZScore(current, quote.marketCap ?? 0);
    const ratio = ratios?.[0];

    return NextResponse.json({
      symbol,
      companyName: quote.companyName ?? quote.name ?? symbol,
      currentPrice: quote.price ?? null,
      marketCap: quote.marketCap ?? null,
      dataYears: { current: current.fiscalYear, prior: prior.fiscalYear },
      valuation: {
        peRatio: ratio?.priceToEarningsRatioTTM ?? null,
        priceToBook: ratio?.priceToBookRatioTTM ?? null,
        evToEbitda: ratio?.enterpriseValueMultipleTTM ?? null,
      },
      fScore,
      zScore,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

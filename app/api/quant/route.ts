import { NextRequest, NextResponse } from "next/server";
import { computeFScore, computeZScore, type AnnualFinancials } from "@/lib/quant";
import { lookupCik, fetchCompanyFacts, extractTwoYearFinancials, type SecAnnualFinancials } from "@/lib/secEdgar";
import { fetchYahooPrice } from "@/lib/yahooFinance";

function toAnnualFinancials(s: SecAnnualFinancials): AnnualFinancials {
  return {
    fiscalYear: s.fiscalYear,
    revenue: s.revenue,
    netIncome: s.netIncome,
    grossProfit: s.grossProfit,
    ebit: s.ebit,
    totalAssets: s.totalAssets,
    totalCurrentAssets: s.totalCurrentAssets,
    totalCurrentLiabilities: s.totalCurrentLiabilities,
    totalLiabilities: s.totalLiabilities,
    retainedEarnings: s.retainedEarnings,
    longTermDebt: s.longTermDebt,
    sharesOutstanding: s.sharesOutstandingAtYearEnd,
    operatingCashFlow: s.operatingCashFlow,
  };
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: "请提供 symbol 参数" }, { status: 400 });
  }

  try {
    const cikInfo = await lookupCik(symbol);
    if (!cikInfo) {
      return NextResponse.json(
        { error: `在 SEC EDGAR 里找不到股票代码 ${symbol}(可能不是美股上市公司,或代码有误)` },
        { status: 404 }
      );
    }

    const [facts, currentPrice] = await Promise.all([
      fetchCompanyFacts(cikInfo.cik),
      fetchYahooPrice(symbol),
    ]);

    const financials = extractTwoYearFinancials(facts);
    if (!financials) {
      return NextResponse.json(
        { error: `${symbol} 在 SEC EDGAR 里的历史财报数据不足两个财年,无法计算需要同比对比的量化评分` },
        { status: 422 }
      );
    }

    const current = toAnnualFinancials(financials.current);
    const prior = toAnnualFinancials(financials.prior);

    const marketCap =
      currentPrice != null && financials.sharesOutstanding ? currentPrice * financials.sharesOutstanding : 0;

    const fScore = computeFScore(current, prior);
    const zScore = computeZScore(current, marketCap);

    const eps = current.sharesOutstanding ? current.netIncome / current.sharesOutstanding : null;
    const bookValuePerShare = current.sharesOutstanding
      ? (current.totalAssets - current.totalLiabilities) / current.sharesOutstanding
      : null;

    return NextResponse.json({
      symbol,
      companyName: cikInfo.companyName,
      currentPrice,
      marketCap: marketCap || null,
      dataYears: { current: current.fiscalYear, prior: prior.fiscalYear },
      valuation: {
        peRatio: currentPrice != null && eps ? Number((currentPrice / eps).toFixed(2)) : null,
        priceToBook:
          currentPrice != null && bookValuePerShare ? Number((currentPrice / bookValuePerShare).toFixed(2)) : null,
        evToEbitda: null, // SEC数据不直接提供EBITDA所需的折旧摊销明细,暂不计算,避免编造
      },
      fScore,
      zScore,
      dataSourceNote:
        financials.missingConcepts.length > 0
          ? `以下科目未能从SEC财报中找到,已按0处理,可能影响对应评分项:${financials.missingConcepts.join(", ")}`
          : null,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

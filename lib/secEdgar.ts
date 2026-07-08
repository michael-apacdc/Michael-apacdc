// SEC EDGAR:美国证监会官方免费公开数据接口,提供所有美股上市公司报送的原始财报
// XBRL数据。不需要API key,没有"仅覆盖大盘股"这类商业API常见的限制,长期免费稳定。
// SEC 要求请求带上能识别身份的 User-Agent,不能用空白/默认值。
const SEC_USER_AGENT = "DataCenterIndustryReport chengang08@gmail.com";

async function secFetch<T>(url: string, revalidateSeconds: number): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
    next: { revalidate: revalidateSeconds },
  });
  if (!res.ok) {
    throw new Error(`SEC EDGAR 请求失败: HTTP ${res.status} (${url})`);
  }
  return (await res.json()) as T;
}

interface TickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

let tickerMapCache: Map<string, TickerEntry> | null = null;

async function getTickerMap(): Promise<Map<string, TickerEntry>> {
  if (tickerMapCache) return tickerMapCache;
  const data = await secFetch<Record<string, TickerEntry>>(
    "https://www.sec.gov/files/company_tickers.json",
    24 * 60 * 60 // 一天内复用,这个文件不常变
  );
  tickerMapCache = new Map(Object.values(data).map((entry) => [entry.ticker.toUpperCase(), entry]));
  return tickerMapCache;
}

export async function lookupCik(ticker: string): Promise<{ cik: string; companyName: string } | null> {
  const map = await getTickerMap();
  const entry = map.get(ticker.toUpperCase());
  if (!entry) return null;
  return { cik: String(entry.cik_str).padStart(10, "0"), companyName: entry.title };
}

interface XbrlFact {
  end: string;
  val: number;
  fy: number;
  fp: string;
  form: string;
  filed: string;
}

interface CompanyFacts {
  facts: {
    "us-gaap"?: Record<string, { units: Record<string, XbrlFact[]> }>;
    dei?: Record<string, { units: Record<string, XbrlFact[]> }>;
  };
}

export async function fetchCompanyFacts(cik: string): Promise<CompanyFacts> {
  return secFetch<CompanyFacts>(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
    6 * 60 * 60 // 半天内复用,财报不会当天变
  );
}

// 同一个"end"日期在相邻两年的10-K里会重复出现(作为对比年份),按 end 去重,
// 只保留10-K(年报),按时间从近到远排序。unit 通常是 USD(金额科目)或 shares(股数科目)。
function annualSeries(facts: CompanyFacts, concept: string, unit: "USD" | "shares"): XbrlFact[] {
  const series = facts.facts["us-gaap"]?.[concept]?.units?.[unit];
  if (!series) return [];
  const byEnd = new Map<string, XbrlFact>();
  for (const item of series) {
    if (item.form === "10-K") byEnd.set(item.end, item);
  }
  return [...byEnd.values()].sort((a, b) => (a.end < b.end ? 1 : -1));
}

// 同一个财务科目在不同公司/年份可能用不同的XBRL标签(比如营收有的用Revenues,
// 有的用RevenueFromContractWithCustomerExcludingAssessedTax),按顺序尝试,
// 找到第一个有至少2个年度数据的标签就用它。
function findTwoRecentYears(
  facts: CompanyFacts,
  conceptCandidates: string[],
  unit: "USD" | "shares"
): [XbrlFact, XbrlFact] | null {
  for (const concept of conceptCandidates) {
    const series = annualSeries(facts, concept, unit);
    if (series.length >= 2) return [series[0], series[1]];
  }
  return null;
}

const CONCEPT_FALLBACKS = {
  revenue: {
    unit: "USD",
    tags: [
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "RevenueFromContractWithCustomerIncludingAssessedTax",
      "SalesRevenueNet",
    ],
  },
  netIncome: { unit: "USD", tags: ["NetIncomeLoss", "ProfitLoss"] },
  grossProfit: { unit: "USD", tags: ["GrossProfit"] },
  ebit: { unit: "USD", tags: ["OperatingIncomeLoss"] },
  totalAssets: { unit: "USD", tags: ["Assets"] },
  totalCurrentAssets: { unit: "USD", tags: ["AssetsCurrent"] },
  totalCurrentLiabilities: { unit: "USD", tags: ["LiabilitiesCurrent"] },
  totalLiabilities: { unit: "USD", tags: ["Liabilities"] },
  retainedEarnings: { unit: "USD", tags: ["RetainedEarningsAccumulatedDeficit"] },
  longTermDebt: { unit: "USD", tags: ["LongTermDebtNoncurrent", "LongTermDebt"] },
  operatingCashFlow: {
    unit: "USD",
    tags: [
      "NetCashProvidedByUsedInOperatingActivities",
      "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
    ],
  },
  sharesOutstandingAtYearEnd: {
    unit: "shares",
    tags: [
      "WeightedAverageNumberOfSharesOutstandingBasic",
      "WeightedAverageNumberOfDilutedSharesOutstanding",
      "CommonStockSharesOutstanding",
    ],
  },
} as const;

export interface SecAnnualFinancials {
  fiscalYear: string;
  revenue: number;
  netIncome: number;
  grossProfit: number;
  ebit: number;
  totalAssets: number;
  totalCurrentAssets: number;
  totalCurrentLiabilities: number;
  totalLiabilities: number;
  retainedEarnings: number;
  longTermDebt: number;
  operatingCashFlow: number;
  sharesOutstandingAtYearEnd: number;
}

export interface SecFinancialsResult {
  current: SecAnnualFinancials;
  prior: SecAnnualFinancials;
  sharesOutstanding: number | null;
  missingConcepts: string[];
}

export function extractTwoYearFinancials(facts: CompanyFacts): SecFinancialsResult | null {
  const missingConcepts: string[] = [];
  const pairs: Partial<Record<keyof typeof CONCEPT_FALLBACKS, [XbrlFact, XbrlFact]>> = {};

  for (const key of Object.keys(CONCEPT_FALLBACKS) as (keyof typeof CONCEPT_FALLBACKS)[]) {
    const { unit, tags } = CONCEPT_FALLBACKS[key];
    const pair = findTwoRecentYears(facts, [...tags], unit);
    if (pair) {
      pairs[key] = pair;
    } else {
      missingConcepts.push(key);
    }
  }

  // 这两项是F-Score/Z-Score计算的硬性前提,缺了就没法算,直接放弃
  if (!pairs.totalAssets || !pairs.netIncome) return null;

  const val = (key: keyof typeof CONCEPT_FALLBACKS, idx: 0 | 1): number => pairs[key]?.[idx]?.val ?? 0;
  const fiscalYearOf = (idx: 0 | 1): string => pairs.totalAssets![idx].end.slice(0, 4);

  const build = (idx: 0 | 1): SecAnnualFinancials => ({
    fiscalYear: fiscalYearOf(idx),
    revenue: val("revenue", idx),
    netIncome: val("netIncome", idx),
    grossProfit: val("grossProfit", idx),
    ebit: val("ebit", idx),
    totalAssets: val("totalAssets", idx),
    totalCurrentAssets: val("totalCurrentAssets", idx),
    totalCurrentLiabilities: val("totalCurrentLiabilities", idx),
    totalLiabilities: val("totalLiabilities", idx),
    retainedEarnings: val("retainedEarnings", idx),
    longTermDebt: val("longTermDebt", idx),
    operatingCashFlow: val("operatingCashFlow", idx),
    sharesOutstandingAtYearEnd: val("sharesOutstandingAtYearEnd", idx),
  });

  const sharesSeries = facts.facts.dei?.EntityCommonStockSharesOutstanding?.units?.shares;
  const sharesOutstanding = sharesSeries
    ? [...sharesSeries].sort((a, b) => (a.end < b.end ? 1 : -1))[0]?.val ?? null
    : null;

  return {
    current: build(0),
    prior: build(1),
    sharesOutstanding,
    missingConcepts,
  };
}

// 量化分析核心算法:两个公开发表、被广泛引用的经典量化模型,纯数学计算,不依赖AI。
// - Piotroski F-Score (Piotroski, 2000):9项财务质量打分,衡量基本面是否在改善
// - Altman Z-Score (Altman, 1968):经典破产风险预警模型

export interface AnnualFinancials {
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
  sharesOutstanding: number;
  operatingCashFlow: number;
}

export interface FScoreCriterion {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface FScoreResult {
  score: number;
  maxScore: number;
  criteria: FScoreCriterion[];
}

export interface ZScoreResult {
  score: number;
  zone: "safe" | "grey" | "distress";
  components: { label: string; value: number }[];
}

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

// current = 最近一个财年,prior = 上一个财年
export function computeFScore(current: AnnualFinancials, prior: AnnualFinancials): FScoreResult {
  const roaCurrent = safeDiv(current.netIncome, current.totalAssets);
  const roaPrior = safeDiv(prior.netIncome, prior.totalAssets);
  const currentRatioCurrent = safeDiv(current.totalCurrentAssets, current.totalCurrentLiabilities);
  const currentRatioPrior = safeDiv(prior.totalCurrentAssets, prior.totalCurrentLiabilities);
  const ltDebtRatioCurrent = safeDiv(current.longTermDebt, current.totalAssets);
  const ltDebtRatioPrior = safeDiv(prior.longTermDebt, prior.totalAssets);
  const grossMarginCurrent = safeDiv(current.grossProfit, current.revenue);
  const grossMarginPrior = safeDiv(prior.grossProfit, prior.revenue);
  const assetTurnoverCurrent = safeDiv(current.revenue, current.totalAssets);
  const assetTurnoverPrior = safeDiv(prior.revenue, prior.totalAssets);

  const criteria: FScoreCriterion[] = [
    {
      key: "positive_roa",
      label: "总资产收益率(ROA)为正",
      passed: roaCurrent > 0,
      detail: `ROA = ${(roaCurrent * 100).toFixed(1)}%`,
    },
    {
      key: "positive_ocf",
      label: "经营性现金流为正",
      passed: current.operatingCashFlow > 0,
      detail: `经营现金流 = ${current.operatingCashFlow.toLocaleString()}`,
    },
    {
      key: "improving_roa",
      label: "ROA同比改善",
      passed: roaCurrent > roaPrior,
      detail: `${(roaPrior * 100).toFixed(1)}% → ${(roaCurrent * 100).toFixed(1)}%`,
    },
    {
      key: "earnings_quality",
      label: "经营现金流高于净利润(盈利质量)",
      passed: current.operatingCashFlow > current.netIncome,
      detail: `现金流 ${current.operatingCashFlow.toLocaleString()} vs 净利润 ${current.netIncome.toLocaleString()}`,
    },
    {
      key: "decreasing_leverage",
      label: "长期负债率同比下降",
      passed: ltDebtRatioCurrent < ltDebtRatioPrior,
      detail: `${(ltDebtRatioPrior * 100).toFixed(1)}% → ${(ltDebtRatioCurrent * 100).toFixed(1)}%`,
    },
    {
      key: "improving_current_ratio",
      label: "流动比率同比改善",
      passed: currentRatioCurrent > currentRatioPrior,
      detail: `${currentRatioPrior.toFixed(2)} → ${currentRatioCurrent.toFixed(2)}`,
    },
    {
      key: "no_dilution",
      label: "未大幅增发股份(无明显稀释)",
      passed: current.sharesOutstanding <= prior.sharesOutstanding * 1.02,
      detail: `${prior.sharesOutstanding.toLocaleString()} → ${current.sharesOutstanding.toLocaleString()}`,
    },
    {
      key: "improving_gross_margin",
      label: "毛利率同比改善",
      passed: grossMarginCurrent > grossMarginPrior,
      detail: `${(grossMarginPrior * 100).toFixed(1)}% → ${(grossMarginCurrent * 100).toFixed(1)}%`,
    },
    {
      key: "improving_asset_turnover",
      label: "总资产周转率同比改善",
      passed: assetTurnoverCurrent > assetTurnoverPrior,
      detail: `${assetTurnoverPrior.toFixed(2)} → ${assetTurnoverCurrent.toFixed(2)}`,
    },
  ];

  return {
    score: criteria.filter((c) => c.passed).length,
    maxScore: 9,
    criteria,
  };
}

export function computeZScore(current: AnnualFinancials, marketCap: number): ZScoreResult {
  const workingCapitalRatio = safeDiv(
    current.totalCurrentAssets - current.totalCurrentLiabilities,
    current.totalAssets
  );
  const retainedEarningsRatio = safeDiv(current.retainedEarnings, current.totalAssets);
  const ebitRatio = safeDiv(current.ebit, current.totalAssets);
  const equityToLiabilities = safeDiv(marketCap, current.totalLiabilities);
  const assetTurnover = safeDiv(current.revenue, current.totalAssets);

  const score =
    1.2 * workingCapitalRatio +
    1.4 * retainedEarningsRatio +
    3.3 * ebitRatio +
    0.6 * equityToLiabilities +
    1.0 * assetTurnover;

  let zone: ZScoreResult["zone"];
  if (score > 2.99) zone = "safe";
  else if (score > 1.81) zone = "grey";
  else zone = "distress";

  return {
    score: Number(score.toFixed(2)),
    zone,
    components: [
      { label: "营运资金/总资产", value: Number(workingCapitalRatio.toFixed(3)) },
      { label: "留存收益/总资产", value: Number(retainedEarningsRatio.toFixed(3)) },
      { label: "EBIT/总资产", value: Number(ebitRatio.toFixed(3)) },
      { label: "市值/总负债", value: Number(equityToLiabilities.toFixed(3)) },
      { label: "营收/总资产", value: Number(assetTurnover.toFixed(3)) },
    ],
  };
}

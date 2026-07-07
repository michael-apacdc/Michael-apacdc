export type ReportStatus = "complete" | "partial" | "failed";

export type RegionTag =
  | "global"
  | "apac"
  | "china"
  | "japan"
  | "korea"
  | "india"
  | "sea"
  | "geopolitics";

export type SourceType = "google_news_rss" | "trade_press_rss" | "direct_rss";

export type TrendCategory =
  | "demand"
  | "supply"
  | "power_cooling"
  | "capital_flows"
  | "geopolitics";

export type Confidence = "high" | "medium" | "low";

export interface DailyReport {
  id: string;
  report_date: string; // YYYY-MM-DD
  generated_at: string;
  status: ReportStatus;
  news_summary_md: string | null;
  apac_investment_md: string | null;
  geopolitics_md: string | null;
  trend_judgment_md: string | null;
  competitive_md: string | null;
  disclaimer_md: string | null;
  raw_pipeline_meta: Record<string, unknown> | null;
}

export interface NewsItem {
  id: string;
  report_date: string;
  source_name: string;
  source_type: SourceType;
  headline: string;
  url: string;
  published_at: string | null;
  region_tag: RegionTag | null;
  used_in_section: string[] | null;
  raw_snippet: string | null;
}

export interface TrendNote {
  id: string;
  report_date: string;
  category: TrendCategory;
  note_md: string;
  source_urls: string[];
  confidence: Confidence | null;
}

// 流水线内部使用的中间结构(尚未写库前)

export interface RawNewsItem {
  source_name: string;
  source_type: SourceType;
  headline: string;
  url: string;
  published_at: string | null;
  region_tag: RegionTag;
  raw_snippet: string | null;
}

export interface SynthesizedTrendNote {
  category: TrendCategory;
  note_md: string;
  source_urls: string[];
  confidence: Confidence;
}

export interface SynthesizedReport {
  news_summary_md: string;
  apac_investment_md: string;
  geopolitics_md: string;
  trend_judgment_md: string;
  competitive_md: string;
  disclaimer_md: string;
  trend_notes: SynthesizedTrendNote[];
}

// Claude 的原始工具调用输出:引用来源一律用上面新闻列表里的编号(source_news_ids),
// 绝不让模型自己转抄网址字符串 —— 这些网址(尤其是 Google News 的编码链接)很长,
// 模型逐字转抄非常容易出错导致链接打不开。真正的网址由 resolveCitations() 按编号查表换入。
export interface RawSynthesizedTrendNote {
  category: TrendCategory;
  note_md: string;
  source_news_ids: number[];
  confidence: Confidence;
}

export interface RawSynthesizedReport {
  news_summary_md: string;
  apac_investment_md: string;
  geopolitics_md: string;
  trend_judgment_md: string;
  competitive_md: string;
  disclaimer_md: string;
  trend_notes: RawSynthesizedTrendNote[];
}

// ============ Phase 2: 东南亚/亚太数据中心选址分析 ============

export type SeaCountryCode = "SG" | "MY" | "TH" | "ID" | "JP" | "AU" | "KR";

export type FitVerdict = "strong_fit" | "partial_fit" | "weak_fit" | "insufficient_data";

export interface SeaCountry {
  code: SeaCountryCode;
  name_zh: string;
}

export interface SeaCountryOutlook {
  id: string;
  report_date: string;
  country_code: SeaCountryCode;
  attractiveness_score: number | null;
  rank_position: number | null;
  outlook_md: string;
  source_urls: string[];
}

export interface SeaDeal {
  id: string;
  report_date: string;
  country_code: SeaCountryCode;
  company: string;
  headline: string;
  deal_summary_md: string;
  land_location: string | null;
  power_score: number | null;
  power_notes_md: string | null;
  connectivity_score: number | null;
  connectivity_notes_md: string | null;
  land_civil_score: number | null;
  land_civil_notes_md: string | null;
  policy_score: number | null;
  policy_notes_md: string | null;
  climate_cooling_score: number | null;
  climate_cooling_notes_md: string | null;
  risk_score: number | null;
  risk_notes_md: string | null;
  overall_score: number | null;
  fit_verdict: FitVerdict | null;
  source_urls: string[];
}

// Claude 对每条土地/电力交易新闻的原始打分(1-5分,信息未披露时为 null),
// 引用来源同样用 source_news_ids 编号,由 resolveSeaCitations() 换成真实链接。
export interface RawSeaDealScore {
  country_code: SeaCountryCode;
  company: string;
  headline: string;
  deal_summary_md: string;
  land_location: string | null;
  power_score: number | null;
  power_notes_md: string;
  connectivity_score: number | null;
  connectivity_notes_md: string;
  land_civil_score: number | null;
  land_civil_notes_md: string;
  policy_score: number | null;
  policy_notes_md: string;
  climate_cooling_score: number | null;
  climate_cooling_notes_md: string;
  risk_score: number | null;
  risk_notes_md: string;
  source_news_ids: number[];
}

export interface RawSeaCountryOutlook {
  country_code: SeaCountryCode;
  attractiveness_score: number;
  rank_position: number;
  outlook_md: string;
  source_news_ids: number[];
}

export interface RawSeaReport {
  deals: RawSeaDealScore[];
  country_outlook: RawSeaCountryOutlook[];
}

// 解析后(引用编号已替换成真实网址)的最终结构,直接对应 writeSeaToDb 要写入的字段
export interface ResolvedSeaDeal extends Omit<RawSeaDealScore, "source_news_ids"> {
  overall_score: number;
  fit_verdict: FitVerdict;
  source_urls: string[];
}

export interface ResolvedSeaCountryOutlook extends Omit<RawSeaCountryOutlook, "source_news_ids"> {
  source_urls: string[];
}

export interface ResolvedSeaReport {
  deals: ResolvedSeaDeal[];
  country_outlook: ResolvedSeaCountryOutlook[];
}

// ============ Phase 3: 美股趋势研判与预警(AI产业细分) ============

export type TrendSubsectorCode =
  | "chip"
  | "optical"
  | "datacenter"
  | "storage"
  | "liquid_cooling"
  | "energy";

export type TrendDirection = "warming" | "cooling" | "stable" | "mixed";

export interface TrendSubsector {
  code: TrendSubsectorCode;
  name_zh: string;
}

export interface TrendTicker {
  ticker: string;
  subsector_code: TrendSubsectorCode;
  company_name: string;
  active: boolean;
}

export interface TrendTickerSignal {
  id: string;
  report_date: string;
  ticker: string;
  subsector_code: TrendSubsectorCode;
  price: number | null;
  change_pct_1d: number | null;
  change_pct_5d: number | null;
  avg_volume_20d: number | null;
  relative_volume: number | null;
  alert_flag: boolean;
  alert_reason: string | null;
}

export interface TrendSubsectorSnapshot {
  id: string;
  report_date: string;
  subsector_code: TrendSubsectorCode;
  trend_direction: TrendDirection | null;
  summary_md: string;
  alert_summary_md: string | null;
  source_urls: string[];
}

// 程序按规则(不是AI)算出来的原始信号,喂给 Claude 做叙述性研判
export interface RawTrendSignal {
  ticker: string;
  subsector_code: TrendSubsectorCode;
  company_name: string;
  price: number | null;
  change_pct_1d: number | null;
  change_pct_5d: number | null;
  avg_volume_20d: number | null;
  relative_volume: number | null;
  alert_flag: boolean;
  alert_reason: string | null;
}

export interface RawTrendSubsectorJudgment {
  subsector_code: TrendSubsectorCode;
  trend_direction: TrendDirection;
  summary_md: string;
  alert_summary_md: string | null;
  source_news_ids: number[];
}

export interface RawTrendReport {
  subsectors: RawTrendSubsectorJudgment[];
}

export interface ResolvedTrendSubsectorJudgment
  extends Omit<RawTrendSubsectorJudgment, "source_news_ids"> {
  source_urls: string[];
}

export interface ResolvedTrendReport {
  subsectors: ResolvedTrendSubsectorJudgment[];
}

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

export type TickerCategory =
  | "hyperscaler"
  | "colo_operator"
  | "chipmaker"
  | "power_utility"
  | "equipment"
  | "other";

export type ClaudeRating = "bullish" | "neutral" | "bearish";

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

export interface TrackedTicker {
  ticker: string;
  company_name: string;
  category: TickerCategory;
  active: boolean;
  added_at: string;
}

export interface StockPick {
  id: string;
  report_date: string;
  ticker: string;
  current_price: number | null;
  currency: string;
  pe_ratio: number | null;
  ev_ebitda: number | null;
  target_price_low: number | null;
  target_price_avg: number | null;
  target_price_high: number | null;
  analyst_rating_consensus: string | null;
  claude_rating: ClaudeRating;
  position_size_pct: number | null;
  rationale_md: string;
  source_urls: string[];
  data_source_note: string | null;
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

export interface RawFinancialData {
  ticker: string;
  current_price: number | null;
  currency: string;
  pe_ratio: number | null;
  ev_ebitda: number | null;
  target_price_low: number | null;
  target_price_avg: number | null;
  target_price_high: number | null;
  analyst_rating_consensus: string | null;
  data_source_note: string | null;
}

export interface SynthesizedStockPick {
  ticker: string;
  claude_rating: ClaudeRating;
  position_size_pct: number | null;
  rationale_md: string;
  source_urls: string[];
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
  stock_picks: SynthesizedStockPick[];
  trend_notes: SynthesizedTrendNote[];
}

// Claude 的原始工具调用输出:引用来源一律用上面新闻列表里的编号(source_news_ids),
// 绝不让模型自己转抄网址字符串 —— 这些网址(尤其是 Google News 的编码链接)很长,
// 模型逐字转抄非常容易出错导致链接打不开。真正的网址由 resolveCitations() 按编号查表换入。
export interface RawSynthesizedStockPick {
  ticker: string;
  claude_rating: ClaudeRating;
  position_size_pct: number | null;
  rationale_md: string;
  source_news_ids: number[];
}

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
  stock_picks: RawSynthesizedStockPick[];
  trend_notes: RawSynthesizedTrendNote[];
}

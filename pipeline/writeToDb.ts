import { createAdminClient } from "../lib/supabase";
import type { RawFinancialData, RawNewsItem, SynthesizedReport } from "../lib/types";

function computeUsedInSection(item: RawNewsItem, report: SynthesizedReport): string[] {
  if (!item.url) return [];
  const sectionTexts: [string, string][] = [
    ["news_summary", report.news_summary_md],
    ["apac_investment", report.apac_investment_md],
    ["geopolitics", report.geopolitics_md],
    ["trend_judgment", report.trend_judgment_md],
    ["competitive", report.competitive_md],
  ];
  const used: string[] = [];
  for (const [name, text] of sectionTexts) {
    if (text && text.includes(item.url)) used.push(name);
  }
  for (const pick of report.stock_picks) {
    if (pick.source_urls.includes(item.url) || pick.rationale_md.includes(item.url)) {
      used.push(`stock_pick:${pick.ticker}`);
    }
  }
  for (const note of report.trend_notes) {
    if (note.source_urls.includes(item.url) || note.note_md.includes(item.url)) {
      used.push(`trend_note:${note.category}`);
    }
  }
  return used;
}

export async function writeReportToDb(
  reportDate: string,
  news: RawNewsItem[],
  financials: RawFinancialData[],
  report: SynthesizedReport,
  status: "complete" | "partial",
  pipelineMeta: Record<string, unknown>
): Promise<{ newsWritten: number; picksWritten: number; notesWritten: number }> {
  const supabase = createAdminClient();

  console.log(`[writeToDb] 写入 daily_reports (${reportDate})...`);
  const { error: reportError } = await supabase.from("daily_reports").upsert(
    {
      report_date: reportDate,
      status,
      news_summary_md: report.news_summary_md,
      apac_investment_md: report.apac_investment_md,
      geopolitics_md: report.geopolitics_md,
      trend_judgment_md: report.trend_judgment_md,
      competitive_md: report.competitive_md,
      disclaimer_md: report.disclaimer_md,
      raw_pipeline_meta: pipelineMeta,
    },
    { onConflict: "report_date" }
  );
  if (reportError) throw new Error(`写入 daily_reports 失败: ${reportError.message}`);

  // 幂等:先删除当天旧数据,再插入新数据,方便重复手动运行做测试
  await supabase.from("news_items").delete().eq("report_date", reportDate);
  await supabase.from("stock_picks").delete().eq("report_date", reportDate);
  await supabase.from("trend_notes").delete().eq("report_date", reportDate);

  const newsRows = news.map((item) => ({
    report_date: reportDate,
    source_name: item.source_name,
    source_type: item.source_type,
    headline: item.headline,
    url: item.url,
    published_at: item.published_at,
    region_tag: item.region_tag,
    used_in_section: computeUsedInSection(item, report),
    raw_snippet: item.raw_snippet,
  }));
  if (newsRows.length > 0) {
    const { error } = await supabase.from("news_items").insert(newsRows);
    if (error) throw new Error(`写入 news_items 失败: ${error.message}`);
  }

  const financialsByTicker = new Map(financials.map((f) => [f.ticker, f]));
  const pickRows = report.stock_picks.map((pick) => {
    const fin = financialsByTicker.get(pick.ticker);
    return {
      report_date: reportDate,
      ticker: pick.ticker,
      current_price: fin?.current_price ?? null,
      currency: fin?.currency ?? "USD",
      pe_ratio: fin?.pe_ratio ?? null,
      ev_ebitda: fin?.ev_ebitda ?? null,
      target_price_low: fin?.target_price_low ?? null,
      target_price_avg: fin?.target_price_avg ?? null,
      target_price_high: fin?.target_price_high ?? null,
      analyst_rating_consensus: fin?.analyst_rating_consensus ?? null,
      claude_rating: pick.claude_rating,
      position_size_pct: pick.position_size_pct,
      rationale_md: pick.rationale_md,
      source_urls: pick.source_urls,
      data_source_note: fin?.data_source_note ?? null,
    };
  });
  if (pickRows.length > 0) {
    const { error } = await supabase.from("stock_picks").upsert(pickRows, {
      onConflict: "report_date,ticker",
    });
    if (error) throw new Error(`写入 stock_picks 失败: ${error.message}`);
  }

  const noteRows = report.trend_notes.map((note) => ({
    report_date: reportDate,
    category: note.category,
    note_md: note.note_md,
    source_urls: note.source_urls,
    confidence: note.confidence,
  }));
  if (noteRows.length > 0) {
    const { error } = await supabase.from("trend_notes").insert(noteRows);
    if (error) throw new Error(`写入 trend_notes 失败: ${error.message}`);
  }

  console.log(
    `[writeToDb] 完成:news_items=${newsRows.length} stock_picks=${pickRows.length} trend_notes=${noteRows.length}`
  );

  return {
    newsWritten: newsRows.length,
    picksWritten: pickRows.length,
    notesWritten: noteRows.length,
  };
}

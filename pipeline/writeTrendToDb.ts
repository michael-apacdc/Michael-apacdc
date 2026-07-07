import { createAdminClient } from "../lib/supabase";
import type { RawTrendSignal, ResolvedTrendReport } from "../lib/types";
import type { RawTrendNewsItem } from "./fetchTrendNews";

export async function writeTrendReportToDb(
  reportDate: string,
  news: RawTrendNewsItem[],
  signals: RawTrendSignal[],
  report: ResolvedTrendReport
): Promise<{ signalsWritten: number; snapshotsWritten: number; newsWritten: number }> {
  const supabase = createAdminClient();

  // 幂等:先删除当天旧数据再插入,方便重复手动运行做测试
  await supabase.from("trend_ticker_signal").delete().eq("report_date", reportDate);
  await supabase.from("trend_subsector_snapshot").delete().eq("report_date", reportDate);
  await supabase.from("trend_news_items").delete().eq("report_date", reportDate);

  const signalRows = signals.map((s) => ({
    report_date: reportDate,
    ticker: s.ticker,
    subsector_code: s.subsector_code,
    price: s.price,
    change_pct_1d: s.change_pct_1d,
    change_pct_5d: s.change_pct_5d,
    avg_volume_20d: s.avg_volume_20d,
    relative_volume: s.relative_volume,
    alert_flag: s.alert_flag,
    alert_reason: s.alert_reason,
  }));
  if (signalRows.length > 0) {
    const { error } = await supabase.from("trend_ticker_signal").upsert(signalRows, {
      onConflict: "report_date,ticker",
    });
    if (error) throw new Error(`写入 trend_ticker_signal 失败: ${error.message}`);
  }

  const snapshotRows = report.subsectors.map((s) => ({
    report_date: reportDate,
    subsector_code: s.subsector_code,
    trend_direction: s.trend_direction,
    summary_md: s.summary_md,
    alert_summary_md: s.alert_summary_md,
    source_urls: s.source_urls,
  }));
  if (snapshotRows.length > 0) {
    const { error } = await supabase.from("trend_subsector_snapshot").upsert(snapshotRows, {
      onConflict: "report_date,subsector_code",
    });
    if (error) throw new Error(`写入 trend_subsector_snapshot 失败: ${error.message}`);
  }

  const newsRows = news.map((item) => ({
    report_date: reportDate,
    subsector_code: item.subsector_code,
    headline: item.headline,
    url: item.url,
    source_name: item.source_name,
  }));
  if (newsRows.length > 0) {
    const { error } = await supabase.from("trend_news_items").insert(newsRows);
    if (error) throw new Error(`写入 trend_news_items 失败: ${error.message}`);
  }

  console.log(
    `[writeTrendToDb] 完成:trend_ticker_signal=${signalRows.length} trend_subsector_snapshot=${snapshotRows.length} trend_news_items=${newsRows.length}`
  );

  return {
    signalsWritten: signalRows.length,
    snapshotsWritten: snapshotRows.length,
    newsWritten: newsRows.length,
  };
}

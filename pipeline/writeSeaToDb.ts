import { createAdminClient } from "../lib/supabase";
import type { ResolvedSeaReport } from "../lib/types";

export async function writeSeaReportToDb(
  reportDate: string,
  report: ResolvedSeaReport
): Promise<{ dealsWritten: number; outlooksWritten: number }> {
  const supabase = createAdminClient();

  // 幂等:先删除当天旧数据再插入,方便重复手动运行做测试
  await supabase.from("sea_deals").delete().eq("report_date", reportDate);
  await supabase.from("sea_country_outlook").delete().eq("report_date", reportDate);

  const dealRows = report.deals.map((deal) => ({
    report_date: reportDate,
    country_code: deal.country_code,
    company: deal.company,
    headline: deal.headline,
    deal_summary_md: deal.deal_summary_md,
    land_location: deal.land_location,
    power_score: deal.power_score,
    power_notes_md: deal.power_notes_md,
    connectivity_score: deal.connectivity_score,
    connectivity_notes_md: deal.connectivity_notes_md,
    land_civil_score: deal.land_civil_score,
    land_civil_notes_md: deal.land_civil_notes_md,
    policy_score: deal.policy_score,
    policy_notes_md: deal.policy_notes_md,
    climate_cooling_score: deal.climate_cooling_score,
    climate_cooling_notes_md: deal.climate_cooling_notes_md,
    risk_score: deal.risk_score,
    risk_notes_md: deal.risk_notes_md,
    overall_score: deal.overall_score,
    fit_verdict: deal.fit_verdict,
    source_urls: deal.source_urls,
  }));
  if (dealRows.length > 0) {
    const { error } = await supabase.from("sea_deals").insert(dealRows);
    if (error) throw new Error(`写入 sea_deals 失败: ${error.message}`);
  }

  const outlookRows = report.country_outlook.map((outlook) => ({
    report_date: reportDate,
    country_code: outlook.country_code,
    attractiveness_score: outlook.attractiveness_score,
    rank_position: outlook.rank_position,
    outlook_md: outlook.outlook_md,
    source_urls: outlook.source_urls,
  }));
  if (outlookRows.length > 0) {
    const { error } = await supabase.from("sea_country_outlook").upsert(outlookRows, {
      onConflict: "report_date,country_code",
    });
    if (error) throw new Error(`写入 sea_country_outlook 失败: ${error.message}`);
  }

  console.log(
    `[writeSeaToDb] 完成:sea_deals=${dealRows.length} sea_country_outlook=${outlookRows.length}`
  );

  return { dealsWritten: dealRows.length, outlooksWritten: outlookRows.length };
}

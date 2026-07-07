import Link from "next/link";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase";
import ReportSection from "@/components/ReportSection";
import Disclaimer from "@/components/Disclaimer";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const supabase = createPublicClient();

  const { data: report } = await supabase
    .from("daily_reports")
    .select("*")
    .eq("report_date", date)
    .maybeSingle();

  if (!report) notFound();

  const [{ data: prev }, { data: next }] = await Promise.all([
    supabase
      .from("daily_reports")
      .select("report_date")
      .lt("report_date", date)
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("daily_reports")
      .select("report_date")
      .gt("report_date", date)
      .order("report_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs text-muted">DAILY REPORT</p>
          <h1 className="mt-1 font-mono text-2xl font-semibold tracking-tight text-foreground">
            {date}
          </h1>
          {report.status !== "complete" && (
            <span className="mt-2 inline-block rounded border border-warning/30 bg-warning/10 px-2.5 py-0.5 font-mono text-xs text-warning">
              部分数据源当日抓取失败,内容可能不完整
            </span>
          )}
        </div>
        <div className="flex gap-4 font-mono text-xs">
          {prev ? (
            <Link href={`/report/${prev.report_date}`} className="text-muted transition-colors hover:text-accent">
              ← {prev.report_date}
            </Link>
          ) : (
            <span className="text-muted/40">← 无更早报告</span>
          )}
          {next ? (
            <Link href={`/report/${next.report_date}`} className="text-muted transition-colors hover:text-accent">
              {next.report_date} →
            </Link>
          ) : (
            <span className="text-muted/40">无更新报告 →</span>
          )}
        </div>
      </div>

      <ReportSection index="01" title="重大新闻摘要" content={report.news_summary_md} />
      <ReportSection index="02" title="亚太地区数据中心投资动态" content={report.apac_investment_md} />
      <ReportSection index="03" title="地缘政治相关报道" content={report.geopolitics_md} />
      <ReportSection index="04" title="行业趋势判断" content={report.trend_judgment_md} />
      <ReportSection index="05" title="竞争态势分析" content={report.competitive_md} />

      <Disclaimer content={report.disclaimer_md} />
    </div>
  );
}

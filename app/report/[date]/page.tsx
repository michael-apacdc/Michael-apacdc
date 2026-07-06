import Link from "next/link";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase";
import type { StockPick } from "@/lib/types";
import ReportSection from "@/components/ReportSection";
import StockPickCard from "@/components/StockPickCard";
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

  const [{ data: report }, { data: picks }] = await Promise.all([
    supabase.from("daily_reports").select("*").eq("report_date", date).maybeSingle(),
    supabase
      .from("stock_picks")
      .select("*")
      .eq("report_date", date)
      .order("ticker", { ascending: true }),
  ]);

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
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{date} 日报</h1>
          {report.status !== "complete" && (
            <span className="mt-1 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
              部分数据源当日抓取失败,内容可能不完整
            </span>
          )}
        </div>
        <div className="flex gap-3 text-sm">
          {prev ? (
            <Link href={`/report/${prev.report_date}`} className="text-blue-600 hover:underline">
              ← {prev.report_date}
            </Link>
          ) : (
            <span className="text-slate-300">← 无更早报告</span>
          )}
          {next ? (
            <Link href={`/report/${next.report_date}`} className="text-blue-600 hover:underline">
              {next.report_date} →
            </Link>
          ) : (
            <span className="text-slate-300">无更新报告 →</span>
          )}
        </div>
      </div>

      <ReportSection title="1. 重大新闻摘要" content={report.news_summary_md} />
      <ReportSection title="2. 亚太地区数据中心投资动态" content={report.apac_investment_md} />
      <ReportSection title="3. 地缘政治相关报道" content={report.geopolitics_md} />
      <ReportSection title="4. 行业趋势判断" content={report.trend_judgment_md} />
      <ReportSection title="5. 竞争态势分析" content={report.competitive_md} />

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">6. 个股投资建议</h2>
        {picks && picks.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {(picks as StockPick[]).map((pick) => (
              <StockPickCard key={pick.ticker} pick={pick} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">今日暂无个股建议数据</p>
        )}
      </section>

      <Disclaimer content={report.disclaimer_md} />
    </div>
  );
}

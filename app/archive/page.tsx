import Link from "next/link";
import { createPublicClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function excerpt(md: string | null, len = 80): string {
  if (!md) return "(无摘要)";
  const plain = md.replace(/[#*`>_-]/g, "").replace(/\[(.*?)\]\(.*?\)/g, "$1").trim();
  return plain.length > len ? `${plain.slice(0, len)}...` : plain;
}

export default async function ArchivePage() {
  const supabase = createPublicClient();
  const { data: reports, error } = await supabase
    .from("daily_reports")
    .select("report_date, status, news_summary_md")
    .order("report_date", { ascending: false });

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">历史归档</h1>

      {error && <p className="text-sm text-red-600">加载失败:{error.message}</p>}

      {reports && reports.length > 0 ? (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {reports.map((r) => (
            <li key={r.report_date} className="p-4 hover:bg-slate-50">
              <Link href={`/report/${r.report_date}`} className="block">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{r.report_date}</span>
                  {r.status !== "complete" && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      部分数据
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-500">{excerpt(r.news_summary_md)}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">尚无历史报告</p>
      )}
    </div>
  );
}

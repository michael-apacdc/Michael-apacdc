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
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div>
        <p className="font-mono text-xs text-muted">ARCHIVE</p>
        <h1 className="mt-1 font-mono text-2xl font-semibold tracking-tight text-foreground">
          历史归档
        </h1>
      </div>

      {error && <p className="font-mono text-xs text-bearish">加载失败:{error.message}</p>}

      {reports && reports.length > 0 ? (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {reports.map((r) => (
            <li key={r.report_date} className="transition-colors hover:bg-surface-hover">
              <Link href={`/report/${r.report_date}`} className="block px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-foreground">
                    {r.report_date}
                  </span>
                  {r.status !== "complete" && (
                    <span className="rounded border border-warning/30 bg-warning/10 px-2 py-0.5 font-mono text-[10px] text-warning">
                      部分数据
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm text-muted">{excerpt(r.news_summary_md)}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-mono text-xs text-muted">尚无历史报告</p>
      )}
    </div>
  );
}

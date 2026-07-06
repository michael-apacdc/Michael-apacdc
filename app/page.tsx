import { redirect } from "next/navigation";
import { createPublicClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("daily_reports")
    .select("report_date")
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="mb-2 font-mono text-lg font-semibold text-bearish">数据库连接失败</h1>
        <p className="font-mono text-xs text-muted">{error.message}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="mb-2 font-mono text-lg font-semibold text-foreground">尚无报告</h1>
        <p className="font-mono text-xs text-muted">
          每日流水线还没有运行过。可以在 GitHub Actions 里手动触发一次
          &ldquo;Daily Data Center Report Pipeline&rdquo; 来生成第一份报告。
        </p>
      </div>
    );
  }

  redirect(`/report/${data.report_date}`);
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase";
import TickerTrendChart from "@/components/TickerTrendChart";

export const dynamic = "force-dynamic";

const RATING_LABELS: Record<string, string> = {
  bullish: "看多",
  neutral: "中性",
  bearish: "看空",
};

export default async function TickerPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const ticker = symbol.toUpperCase();

  const supabase = createPublicClient();
  const [{ data: ticker_info }, { data: history }] = await Promise.all([
    supabase.from("tracked_tickers").select("*").eq("ticker", ticker).maybeSingle(),
    supabase
      .from("stock_picks")
      .select("*")
      .eq("ticker", ticker)
      .order("report_date", { ascending: true }),
  ]);

  if (!ticker_info) notFound();

  const chartData = (history ?? []).map((row) => ({
    report_date: row.report_date,
    target_price_avg: row.target_price_avg,
    current_price: row.current_price,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div>
        <p className="font-mono text-xs text-muted">TICKER</p>
        <h1 className="mt-1 font-mono text-2xl font-semibold tracking-tight text-foreground">
          {ticker} <span className="text-muted">· {ticker_info.company_name}</span>
        </h1>
        <p className="mt-1 text-sm text-muted">历史评级与目标价趋势</p>
      </div>

      <section className="rounded-md border border-line bg-surface p-6">
        <TickerTrendChart data={chartData} />
      </section>

      <section className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full font-mono text-[13px]">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">日期</th>
              <th className="px-4 py-3">评级</th>
              <th className="px-4 py-3">现价</th>
              <th className="px-4 py-3">目标价(均)</th>
              <th className="px-4 py-3">建议仓位</th>
              <th className="px-4 py-3">报告</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(history ?? []).map((row) => (
              <tr key={row.report_date} className="transition-colors hover:bg-surface-hover">
                <td className="px-4 py-2.5 text-foreground">{row.report_date}</td>
                <td className="px-4 py-2.5 text-foreground">
                  {RATING_LABELS[row.claude_rating] ?? row.claude_rating}
                </td>
                <td className="px-4 py-2.5 text-foreground">{row.current_price ?? "N/A"}</td>
                <td className="px-4 py-2.5 text-foreground">{row.target_price_avg ?? "N/A"}</td>
                <td className="px-4 py-2.5 text-foreground">
                  {row.position_size_pct != null ? `${row.position_size_pct}%` : "N/A"}
                </td>
                <td className="px-4 py-2.5">
                  <Link href={`/report/${row.report_date}`} className="text-accent hover:underline">
                    查看
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!history || history.length === 0) && (
          <p className="p-4 font-mono text-xs text-muted">暂无历史数据</p>
        )}
      </section>
    </div>
  );
}

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
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {ticker} · {ticker_info.company_name}
        </h1>
        <p className="text-sm text-slate-500">历史评级与目标价趋势</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <TickerTrendChart data={chartData} />
      </section>

      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">日期</th>
              <th className="px-4 py-2">评级</th>
              <th className="px-4 py-2">现价</th>
              <th className="px-4 py-2">目标价(均)</th>
              <th className="px-4 py-2">建议仓位</th>
              <th className="px-4 py-2">报告</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(history ?? []).map((row) => (
              <tr key={row.report_date}>
                <td className="px-4 py-2">{row.report_date}</td>
                <td className="px-4 py-2">{RATING_LABELS[row.claude_rating] ?? row.claude_rating}</td>
                <td className="px-4 py-2">{row.current_price ?? "N/A"}</td>
                <td className="px-4 py-2">{row.target_price_avg ?? "N/A"}</td>
                <td className="px-4 py-2">
                  {row.position_size_pct != null ? `${row.position_size_pct}%` : "N/A"}
                </td>
                <td className="px-4 py-2">
                  <Link href={`/report/${row.report_date}`} className="text-blue-600 hover:underline">
                    查看
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!history || history.length === 0) && (
          <p className="p-4 text-sm text-slate-400">暂无历史数据</p>
        )}
      </section>
    </div>
  );
}

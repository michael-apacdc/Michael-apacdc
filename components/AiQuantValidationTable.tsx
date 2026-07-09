import type { AiQuantValidationRow } from "@/lib/types";

function fmt(n: number | null, digits = 1, suffix = ""): string {
  return n == null ? "—" : `${Number(n).toFixed(digits)}${suffix}`;
}

export default function AiQuantValidationTable({ rows }: { rows: AiQuantValidationRow[] }) {
  if (rows.length === 0) {
    return <p className="font-mono text-xs text-muted">暂无检验记录(需先执行 schema_aiquant.sql)</p>;
  }
  const quarters = rows
    .filter((r) => r.period_label !== "TOTAL")
    .sort((a, b) => a.period_label.localeCompare(b.period_label));
  const total = rows.find((r) => r.period_label === "TOTAL");

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full font-mono text-[13px]">
        <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2">季度</th>
            <th className="px-4 py-2">窗口胜率</th>
            <th className="px-4 py-2">模型组合</th>
            <th className="px-4 py-2">等权板块</th>
            <th className="px-4 py-2">超额</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {quarters.map((r) => (
            <tr key={r.period_label} className="transition-colors hover:bg-surface-hover">
              <td className="px-4 py-2 text-foreground">{r.period_label}</td>
              <td className="px-4 py-2 text-foreground">
                {r.wins}/{r.windows}
              </td>
              <td className="px-4 py-2 text-foreground">{fmt(r.strat_return_pct, 1, "%")}</td>
              <td className="px-4 py-2 text-muted">{fmt(r.basket_return_pct, 1, "%")}</td>
              <td className={`px-4 py-2 ${(r.excess_pp ?? 0) >= 0 ? "text-bullish" : "text-bearish"}`}>
                {r.excess_pp != null && r.excess_pp > 0 ? "+" : ""}
                {fmt(r.excess_pp, 1, "pp")}
              </td>
            </tr>
          ))}
          {total && (
            <tr className="border-t border-line-strong bg-white/[0.02] font-semibold">
              <td className="px-4 py-2 text-foreground">合计</td>
              <td className="px-4 py-2 text-foreground">
                {total.wins}/{total.windows}({((total.wins / total.windows) * 100).toFixed(1)}%)
              </td>
              <td className="px-4 py-2 text-foreground">{fmt(total.strat_return_pct, 0, "%")}</td>
              <td className="px-4 py-2 text-muted">{fmt(total.basket_return_pct, 0, "%")}</td>
              <td className="px-4 py-2 text-bearish">{fmt(total.excess_pp, 0, "pp")}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

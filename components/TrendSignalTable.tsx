import type { TrendTickerSignal } from "@/lib/types";

function fmt(n: number | null, digits = 2): string {
  return n == null ? "N/A" : n.toFixed(digits);
}

function pctClass(n: number | null): string {
  if (n == null) return "text-muted";
  return n > 0 ? "text-bullish" : n < 0 ? "text-bearish" : "text-muted";
}

export default function TrendSignalTable({ signals }: { signals: TrendTickerSignal[] }) {
  if (signals.length === 0) {
    return <p className="font-mono text-xs text-muted">暂无跟踪个股信号数据</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full font-mono text-[13px]">
        <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2">代码</th>
            <th className="px-4 py-2">现价</th>
            <th className="px-4 py-2">1日涨跌</th>
            <th className="px-4 py-2">5日涨跌</th>
            <th className="px-4 py-2">相对成交量</th>
            <th className="px-4 py-2">预警</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {signals.map((s) => (
            <tr key={s.ticker} className="transition-colors hover:bg-surface-hover">
              <td className="px-4 py-2 font-semibold text-foreground">{s.ticker}</td>
              <td className="px-4 py-2 text-foreground">{fmt(s.price)}</td>
              <td className={`px-4 py-2 ${pctClass(s.change_pct_1d)}`}>
                {s.change_pct_1d != null ? `${s.change_pct_1d > 0 ? "+" : ""}${s.change_pct_1d.toFixed(1)}%` : "N/A"}
              </td>
              <td className={`px-4 py-2 ${pctClass(s.change_pct_5d)}`}>
                {s.change_pct_5d != null ? `${s.change_pct_5d > 0 ? "+" : ""}${s.change_pct_5d.toFixed(1)}%` : "N/A"}
              </td>
              <td className="px-4 py-2 text-foreground">
                {s.relative_volume != null ? `${s.relative_volume.toFixed(1)}x` : "N/A"}
              </td>
              <td className="px-4 py-2">
                {s.alert_flag ? (
                  <span className="rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning">
                    ⚠ 预警
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

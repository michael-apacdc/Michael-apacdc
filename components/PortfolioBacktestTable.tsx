import type { BacktestStrategy, PortfolioBacktestRow } from "@/lib/types";

const STRATEGY_LABELS: Record<BacktestStrategy, string> = {
  buy_hold: "买入持有(基准)",
  trend_200: "200日线趋势过滤",
  momentum_rotation: "动量轮动",
};

function fmt(n: number | null, digits = 1, suffix = ""): string {
  return n == null ? "N/A" : `${Number(n).toFixed(digits)}${suffix}`;
}

export default function PortfolioBacktestTable({ rows }: { rows: PortfolioBacktestRow[] }) {
  if (rows.length === 0) {
    return <p className="font-mono text-xs text-muted">暂无回测数据,等流水线第一次运行后生成</p>;
  }

  // 组合层面的放最前,然后按代码分组
  const sorted = [...rows].sort((a, b) => {
    if (a.ticker === "PORTFOLIO" && b.ticker !== "PORTFOLIO") return -1;
    if (b.ticker === "PORTFOLIO" && a.ticker !== "PORTFOLIO") return 1;
    return a.ticker === b.ticker
      ? a.strategy.localeCompare(b.strategy)
      : a.ticker.localeCompare(b.ticker);
  });

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full font-mono text-[13px]">
        <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2">标的</th>
            <th className="px-4 py-2">策略</th>
            <th className="px-4 py-2">年化收益</th>
            <th className="px-4 py-2">最大回撤</th>
            <th className="px-4 py-2">年化波动</th>
            <th className="px-4 py-2">夏普</th>
            <th className="px-4 py-2">换仓次数</th>
            <th className="px-4 py-2">回测区间</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((r) => (
            <tr key={`${r.ticker}-${r.strategy}`} className="transition-colors hover:bg-surface-hover">
              <td className="px-4 py-2 font-semibold text-foreground">
                {r.ticker === "PORTFOLIO" ? "整体组合" : r.ticker}
              </td>
              <td className="px-4 py-2 text-foreground">
                {STRATEGY_LABELS[r.strategy] ?? r.strategy}
              </td>
              <td className={`px-4 py-2 ${(r.cagr_pct ?? 0) >= 0 ? "text-bullish" : "text-bearish"}`}>
                {fmt(r.cagr_pct, 1, "%")}
              </td>
              <td className="px-4 py-2 text-bearish">{fmt(r.max_drawdown_pct, 1, "%")}</td>
              <td className="px-4 py-2 text-foreground">{fmt(r.volatility_pct, 1, "%")}</td>
              <td className="px-4 py-2 text-foreground">{fmt(r.sharpe, 2)}</td>
              <td className="px-4 py-2 text-foreground">{r.trade_count ?? "N/A"}</td>
              <td className="px-4 py-2 text-muted">
                {r.start_date} ~ {r.end_date}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

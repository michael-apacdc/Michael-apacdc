import type { PortfolioAction, PortfolioHolding, PortfolioSignal } from "@/lib/types";

const ACTION_LABELS: Record<PortfolioAction, string> = {
  hold: "持有",
  add: "加仓",
  trim: "减仓",
  sell: "卖出",
  watch: "关注",
};

const ACTION_STYLES: Record<PortfolioAction, string> = {
  hold: "bg-white/5 text-muted border-line-strong",
  add: "bg-bullish/10 text-bullish border-bullish/30",
  trim: "bg-warning/10 text-warning border-warning/30",
  sell: "bg-bearish/10 text-bearish border-bearish/30",
  watch: "bg-accent/10 text-accent border-accent/30",
};

function fmt(n: number | null, digits = 2): string {
  return n == null ? "N/A" : Number(n).toFixed(digits);
}

function pctClass(n: number | null): string {
  if (n == null) return "text-muted";
  return n > 0 ? "text-bullish" : n < 0 ? "text-bearish" : "text-muted";
}

function signedPct(n: number | null, digits = 1): string {
  if (n == null) return "N/A";
  return `${n > 0 ? "+" : ""}${Number(n).toFixed(digits)}%`;
}

export default function PortfolioSignalTable({
  signals,
  holdingsByTicker,
}: {
  signals: PortfolioSignal[];
  holdingsByTicker: Map<string, PortfolioHolding>;
}) {
  if (signals.length === 0) {
    return <p className="font-mono text-xs text-muted">暂无持仓信号数据</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full font-mono text-[13px]">
        <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2">代码</th>
            <th className="px-4 py-2">现价</th>
            <th className="px-4 py-2">浮动盈亏</th>
            <th className="px-4 py-2">1日涨跌</th>
            <th className="px-4 py-2">趋势(200日线)</th>
            <th className="px-4 py-2">12-1动量</th>
            <th className="px-4 py-2">RSI</th>
            <th className="px-4 py-2">距高点回撤</th>
            <th className="px-4 py-2">建议</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {signals.map((s) => {
            const holding = holdingsByTicker.get(s.ticker);
            const pnlPct =
              holding?.cost_basis != null && s.price != null && Number(holding.cost_basis) > 0
                ? ((Number(s.price) - Number(holding.cost_basis)) / Number(holding.cost_basis)) * 100
                : null;
            return (
              <tr key={s.ticker} className="align-top transition-colors hover:bg-surface-hover">
                <td className="px-4 py-2 font-semibold text-foreground">
                  {s.ticker}
                  {holding?.shares != null && (
                    <span className="ml-1 text-[11px] font-normal text-muted">{Number(holding.shares)}股</span>
                  )}
                </td>
                <td className="px-4 py-2 text-foreground">{fmt(s.price)}</td>
                <td className={`px-4 py-2 ${pctClass(pnlPct)}`}>{signedPct(pnlPct)}</td>
                <td className={`px-4 py-2 ${pctClass(s.change_pct_1d)}`}>{signedPct(s.change_pct_1d)}</td>
                <td className="px-4 py-2">
                  {s.trend_state === "above_200" ? (
                    <span className="text-bullish">上方</span>
                  ) : s.trend_state === "below_200" ? (
                    <span className="text-bearish">下方</span>
                  ) : (
                    <span className="text-muted">N/A</span>
                  )}
                </td>
                <td className={`px-4 py-2 ${pctClass(s.momentum_12_1)}`}>
                  {signedPct(s.momentum_12_1)}
                  {s.momentum_rank != null && (
                    <span className="ml-1 text-[11px] text-muted">#{s.momentum_rank}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-foreground">{fmt(s.rsi14, 0)}</td>
                <td className={`px-4 py-2 ${pctClass(s.drawdown_pct)}`}>{signedPct(s.drawdown_pct)}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${ACTION_STYLES[s.action]}`}
                  >
                    {ACTION_LABELS[s.action]}
                  </span>
                  {s.action_reasons.length > 0 && (
                    <p className="mt-1 max-w-[280px] whitespace-normal text-[11px] leading-relaxed text-muted">
                      {s.action_reasons.join(";")}
                    </p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

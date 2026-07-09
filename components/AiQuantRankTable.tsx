import type { AiQuantScoreRow } from "@/lib/types";
import { AI_SUBSECTOR_NAMES, AI_UNIVERSE, type AiSubsector } from "@/lib/aiUniverse";

const FACTOR_LABELS: Record<string, string> = {
  resid_mom: "残差动量",
  reversal: "短期反转",
  mom_120: "中期动量",
  prox_high: "距高点",
  vol_trend: "量能",
  low_vol: "低波动",
};

function fmt(n: number | null | undefined, digits = 2): string {
  return n == null ? "—" : Number(n).toFixed(digits);
}

export default function AiQuantRankTable({
  scores,
  pickedTickers,
}: {
  scores: AiQuantScoreRow[];
  pickedTickers: Set<string>;
}) {
  if (scores.length === 0) {
    return <p className="font-mono text-xs text-muted">暂无打分数据</p>;
  }
  const nameByTicker = new Map(AI_UNIVERSE.map((s) => [s.ticker, s.companyName]));
  const ranked = [...scores].sort((a, b) => {
    if (a.rank_position == null) return 1;
    if (b.rank_position == null) return -1;
    return a.rank_position - b.rank_position;
  });

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full font-mono text-[13px]">
        <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2">排名</th>
            <th className="px-4 py-2">代码</th>
            <th className="px-4 py-2">子板块</th>
            <th className="px-4 py-2">合成得分</th>
            <th className="px-4 py-2">主要因子(z值)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {ranked.map((s) => {
            const picked = pickedTickers.has(s.ticker);
            const factorBits = Object.entries(s.factor_z ?? {})
              .filter(([, v]) => v != null)
              .map(([k, v]) => `${FACTOR_LABELS[k] ?? k} ${fmt(v, 1)}`)
              .join(" · ");
            return (
              <tr key={s.ticker} className="transition-colors hover:bg-surface-hover">
                <td className="px-4 py-2 text-foreground">
                  {s.rank_position ?? "—"}
                  {picked && (
                    <span className="ml-1.5 rounded border border-accent/30 bg-accent/10 px-1 py-0.5 text-[10px] text-accent">
                      入选
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 font-semibold text-foreground">
                  {s.ticker}
                  <span className="ml-1 text-[11px] font-normal text-muted">
                    {nameByTicker.get(s.ticker) ?? ""}
                  </span>
                </td>
                <td className="px-4 py-2 text-muted">
                  {AI_SUBSECTOR_NAMES[s.subsector as AiSubsector] ?? s.subsector}
                </td>
                <td
                  className={`px-4 py-2 ${(s.score ?? 0) > 0 ? "text-bullish" : (s.score ?? 0) < 0 ? "text-bearish" : "text-muted"}`}
                >
                  {fmt(s.score)}
                </td>
                <td className="px-4 py-2 text-[11px] text-muted">{factorBits || "数据不足"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

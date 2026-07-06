import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { StockPick } from "@/lib/types";

const RATING_STYLES: Record<StockPick["claude_rating"], string> = {
  bullish: "bg-bullish/10 text-bullish border-bullish/30",
  neutral: "bg-white/5 text-muted border-line-strong",
  bearish: "bg-bearish/10 text-bearish border-bearish/30",
};

const RATING_LABELS: Record<StockPick["claude_rating"], string> = {
  bullish: "看多",
  neutral: "中性",
  bearish: "看空",
};

function fmt(n: number | null, digits = 2): string {
  return n == null ? "N/A" : n.toFixed(digits);
}

export default function StockPickCard({ pick }: { pick: StockPick }) {
  return (
    <div className="rounded-md border border-line bg-surface p-5 transition-colors hover:border-line-strong">
      <div className="mb-4 flex items-center justify-between">
        <a
          href={`/ticker/${pick.ticker}`}
          className="font-mono text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-accent"
        >
          {pick.ticker}
        </a>
        <span
          className={`rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${RATING_STYLES[pick.claude_rating]}`}
        >
          {RATING_LABELS[pick.claude_rating]}
        </span>
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[13px] text-foreground sm:grid-cols-4">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted">现价</dt>
          <dd>
            {fmt(pick.current_price)} {pick.currency}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted">PE</dt>
          <dd>{fmt(pick.pe_ratio)}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted">EV/EBITDA</dt>
          <dd>{fmt(pick.ev_ebitda)}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted">目标价(均)</dt>
          <dd>{fmt(pick.target_price_avg)}</dd>
        </div>
      </dl>

      {pick.position_size_pct != null && (
        <p className="mb-3 font-mono text-xs text-muted">
          建议仓位 <span className="text-accent">{pick.position_size_pct}%</span>
        </p>
      )}

      <div className="prose prose-invert prose-sm max-w-none prose-a:text-accent prose-a:no-underline hover:prose-a:underline">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{pick.rationale_md}</ReactMarkdown>
      </div>

      {pick.data_source_note && (
        <p className="mt-3 font-mono text-[11px] text-muted">数据说明:{pick.data_source_note}</p>
      )}
    </div>
  );
}

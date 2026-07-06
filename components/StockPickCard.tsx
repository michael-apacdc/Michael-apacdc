import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { StockPick } from "@/lib/types";

const RATING_STYLES: Record<StockPick["claude_rating"], string> = {
  bullish: "bg-emerald-100 text-emerald-800",
  neutral: "bg-slate-100 text-slate-700",
  bearish: "bg-red-100 text-red-700",
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
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <a
          href={`/ticker/${pick.ticker}`}
          className="text-base font-semibold text-slate-900 hover:underline"
        >
          {pick.ticker}
        </a>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${RATING_STYLES[pick.claude_rating]}`}
        >
          {RATING_LABELS[pick.claude_rating]}
        </span>
      </div>

      <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-600 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-400">现价</dt>
          <dd>
            {fmt(pick.current_price)} {pick.currency}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">PE</dt>
          <dd>{fmt(pick.pe_ratio)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">EV/EBITDA</dt>
          <dd>{fmt(pick.ev_ebitda)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">目标价(均)</dt>
          <dd>{fmt(pick.target_price_avg)}</dd>
        </div>
      </dl>

      {pick.position_size_pct != null && (
        <p className="mb-3 text-sm text-slate-600">
          建议仓位:<span className="font-medium">{pick.position_size_pct}%</span>
        </p>
      )}

      <div className="prose prose-slate prose-sm max-w-none prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{pick.rationale_md}</ReactMarkdown>
      </div>

      {pick.data_source_note && (
        <p className="mt-3 text-xs text-slate-400">数据说明:{pick.data_source_note}</p>
      )}
    </div>
  );
}

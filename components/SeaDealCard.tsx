import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { FitVerdict, SeaDeal } from "@/lib/types";

const VERDICT_STYLES: Record<FitVerdict, string> = {
  strong_fit: "bg-bullish/10 text-bullish border-bullish/30",
  partial_fit: "bg-warning/10 text-warning border-warning/30",
  weak_fit: "bg-bearish/10 text-bearish border-bearish/30",
  insufficient_data: "bg-white/5 text-muted border-line-strong",
};

const VERDICT_LABELS: Record<FitVerdict, string> = {
  strong_fit: "高度符合选址标准",
  partial_fit: "部分符合选址标准",
  weak_fit: "不太符合选址标准",
  insufficient_data: "信息不足,无法判断",
};

const DIMENSIONS: {
  key: keyof SeaDeal;
  notesKey: keyof SeaDeal;
  label: string;
  weight: string;
}[] = [
  { key: "power_score", notesKey: "power_notes_md", label: "能源与电力", weight: "38%" },
  { key: "connectivity_score", notesKey: "connectivity_notes_md", label: "网络与连接", weight: "22%" },
  { key: "land_civil_score", notesKey: "land_civil_notes_md", label: "土地与工程", weight: "15%" },
  { key: "policy_score", notesKey: "policy_notes_md", label: "税收与政策", weight: "12%" },
  { key: "climate_cooling_score", notesKey: "climate_cooling_notes_md", label: "气候与水资源", weight: "8%" },
  { key: "risk_score", notesKey: "risk_notes_md", label: "自然与人为风险", weight: "5%" },
];

export default function SeaDealCard({ deal }: { deal: SeaDeal }) {
  return (
    <div className="rounded-md border border-line bg-surface p-5 transition-colors hover:border-line-strong">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-mono text-xs text-muted">{deal.company}</span>
          <h3 className="text-sm font-medium text-foreground">{deal.headline}</h3>
          {deal.land_location && (
            <p className="mt-0.5 font-mono text-xs text-muted">地块:{deal.land_location}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted">
            总分 <span className="text-accent">{deal.overall_score ?? "N/A"}</span>/100
          </span>
          {deal.fit_verdict && (
            <span
              className={`rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${VERDICT_STYLES[deal.fit_verdict]}`}
            >
              {VERDICT_LABELS[deal.fit_verdict]}
            </span>
          )}
        </div>
      </div>

      <div className="prose prose-invert prose-sm mb-4 max-w-none prose-a:text-accent prose-a:no-underline hover:prose-a:underline">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{deal.deal_summary_md}</ReactMarkdown>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {DIMENSIONS.map(({ key, notesKey, label, weight }) => {
          const score = deal[key] as number | null;
          const notes = deal[notesKey] as string | null;
          return (
            <div key={key} className="rounded border border-line bg-background/40 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-mono text-[11px] text-muted">
                  {label} <span className="text-muted/60">({weight})</span>
                </span>
                <span className="font-mono text-xs font-medium text-foreground">
                  {score != null ? `${score}/5` : "N/A"}
                </span>
              </div>
              {notes && <p className="text-xs leading-relaxed text-muted">{notes}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

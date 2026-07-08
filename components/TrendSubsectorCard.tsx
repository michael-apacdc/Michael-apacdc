import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TrendDirection, TrendSubsectorSnapshot } from "@/lib/types";
import type { SubsectorAggregate } from "@/lib/trendSubsectors";
import { MONEY_FLOW_QUADRANT_LABELS } from "@/lib/trendSubsectors";

const DIRECTION_LABELS: Record<TrendDirection, string> = {
  warming: "升温",
  cooling: "降温",
  stable: "平稳",
  mixed: "分化",
};

const DIRECTION_STYLES: Record<TrendDirection, string> = {
  warming: "bg-bullish/10 text-bullish border-bullish/30",
  cooling: "bg-bearish/10 text-bearish border-bearish/30",
  stable: "bg-white/5 text-muted border-line-strong",
  mixed: "bg-warning/10 text-warning border-warning/30",
};

const QUADRANT_STYLES: Record<SubsectorAggregate["quadrant"], string> = {
  inflow: "bg-bullish/10 text-bullish border-bullish/30",
  outflow: "bg-bearish/10 text-bearish border-bearish/30",
  weak_rally: "bg-warning/10 text-warning border-warning/30",
  quiet: "bg-white/5 text-muted border-line-strong",
};

export default function TrendSubsectorCard({
  name,
  snapshot,
  alertCount,
  aggregate,
}: {
  name: string;
  snapshot: TrendSubsectorSnapshot | null;
  alertCount: number;
  aggregate: SubsectorAggregate;
}) {
  return (
    <div className="rounded-md border border-line bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-mono text-sm font-semibold text-foreground">{name}</h3>
        <div className="flex items-center gap-2">
          {alertCount > 0 && (
            <span className="rounded border border-warning/30 bg-warning/10 px-2 py-0.5 font-mono text-[11px] text-warning">
              {alertCount} 项预警
            </span>
          )}
          <span
            className={`rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${QUADRANT_STYLES[aggregate.quadrant]}`}
          >
            {MONEY_FLOW_QUADRANT_LABELS[aggregate.quadrant]}
          </span>
          {snapshot?.trend_direction && (
            <span
              className={`rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${DIRECTION_STYLES[snapshot.trend_direction]}`}
            >
              {DIRECTION_LABELS[snapshot.trend_direction]}
            </span>
          )}
        </div>
      </div>
      <p className="mb-3 font-mono text-[11px] text-muted">
        平均5日动量 {aggregate.avgChangePct5d != null ? `${aggregate.avgChangePct5d}%` : "N/A"} · 平均相对成交量{" "}
        {aggregate.avgRelativeVolume != null ? `${aggregate.avgRelativeVolume}x` : "N/A"}
      </p>

      {snapshot ? (
        <div className="prose prose-invert prose-sm max-w-none prose-a:text-accent prose-a:no-underline hover:prose-a:underline">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{snapshot.summary_md}</ReactMarkdown>
          {snapshot.alert_summary_md && (
            <div className="mt-2 rounded border border-warning/25 bg-warning/5 p-3">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{snapshot.alert_summary_md}</ReactMarkdown>
            </div>
          )}
        </div>
      ) : (
        <p className="font-mono text-xs text-muted">今日暂无该细分行业的判断数据</p>
      )}
    </div>
  );
}

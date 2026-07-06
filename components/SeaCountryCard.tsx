import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SeaCountryOutlook } from "@/lib/types";

const COUNTRY_NAMES: Record<string, string> = {
  SG: "新加坡",
  MY: "马来西亚",
  TH: "泰国",
  ID: "印度尼西亚",
  JP: "日本",
  AU: "澳大利亚",
};

export default function SeaCountryCard({ outlook }: { outlook: SeaCountryOutlook }) {
  return (
    <div className="rounded-md border border-line bg-surface p-5 transition-colors hover:border-line-strong">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded border border-accent/30 bg-accent-dim font-mono text-xs font-semibold text-accent">
            {outlook.rank_position ?? "-"}
          </span>
          <span className="font-mono text-sm font-semibold text-foreground">
            {COUNTRY_NAMES[outlook.country_code] ?? outlook.country_code}
          </span>
        </div>
        <span className="font-mono text-xs text-muted">
          热度 <span className="text-accent">{outlook.attractiveness_score ?? "N/A"}</span>/100
        </span>
      </div>
      <div className="prose prose-invert prose-sm max-w-none prose-a:text-accent prose-a:no-underline hover:prose-a:underline">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{outlook.outlook_md}</ReactMarkdown>
      </div>
    </div>
  );
}

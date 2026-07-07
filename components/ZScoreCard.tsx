interface Component {
  label: string;
  value: number;
}

const ZONE_LABELS: Record<string, string> = {
  safe: "安全区",
  grey: "灰色地带",
  distress: "危险区",
};

const ZONE_STYLES: Record<string, string> = {
  safe: "bg-bullish/10 text-bullish border-bullish/30",
  grey: "bg-warning/10 text-warning border-warning/30",
  distress: "bg-bearish/10 text-bearish border-bearish/30",
};

export default function ZScoreCard({
  score,
  zone,
  components,
}: {
  score: number;
  zone: string;
  components: Component[];
}) {
  return (
    <div className="rounded-md border border-line bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium tracking-wide text-foreground">
          Altman Z-Score
          <span className="ml-2 font-mono text-xs font-normal text-muted">破产风险预警</span>
        </h3>
        <span className={`rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${ZONE_STYLES[zone]}`}>
          {ZONE_LABELS[zone] ?? zone} {score}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {components.map((c) => (
          <div key={c.label} className="rounded border border-line bg-background/40 p-2 text-center">
            <div className="font-mono text-xs text-foreground">{c.value}</div>
            <div className="mt-0.5 text-[10px] text-muted">{c.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono text-[11px] text-muted">
        Z &gt; 2.99 安全 · 1.81–2.99 灰色地带 · Z &lt; 1.81 危险区(原始模型主要面向制造业公司,其他行业仅供参考)
      </p>
    </div>
  );
}

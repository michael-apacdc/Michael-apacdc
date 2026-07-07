interface Criterion {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
}

export default function FScoreCard({
  score,
  maxScore,
  criteria,
}: {
  score: number;
  maxScore: number;
  criteria: Criterion[];
}) {
  const tier = score >= 7 ? "优质" : score >= 4 ? "中等" : "偏弱";
  const tierStyle =
    score >= 7
      ? "bg-bullish/10 text-bullish border-bullish/30"
      : score >= 4
        ? "bg-warning/10 text-warning border-warning/30"
        : "bg-bearish/10 text-bearish border-bearish/30";

  return (
    <div className="rounded-md border border-line bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium tracking-wide text-foreground">
          Piotroski F-Score
          <span className="ml-2 font-mono text-xs font-normal text-muted">财务质量评分</span>
        </h3>
        <span className={`rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${tierStyle}`}>
          {tier} {score}/{maxScore}
        </span>
      </div>
      <div className="space-y-2">
        {criteria.map((c) => (
          <div key={c.key} className="flex items-start gap-2 text-xs">
            <span className={c.passed ? "text-bullish" : "text-bearish"}>{c.passed ? "✓" : "✗"}</span>
            <div>
              <span className="text-foreground">{c.label}</span>
              <span className="ml-2 font-mono text-muted">{c.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

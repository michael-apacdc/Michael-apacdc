import type { SubsectorAggregate } from "@/lib/trendSubsectors";
import { TREND_SUBSECTOR_NAMES } from "@/lib/trendSubsectors";

const WIDTH = 640;
const HEIGHT = 420;
const PADDING = 56;

const QUADRANT_COLORS: Record<SubsectorAggregate["quadrant"], string> = {
  inflow: "var(--bullish)",
  outflow: "var(--bearish)",
  weak_rally: "var(--warning)",
  quiet: "var(--muted)",
};

// 横轴:平均5日动量(当前走势方向,越靠右越强势)。纵轴:平均相对成交量(资金关注度代理指标,越靠上说明放量越明显)。
export default function TrendQuadrantChart({ aggregates }: { aggregates: SubsectorAggregate[] }) {
  const plottable = aggregates.filter((a) => a.avgChangePct5d != null && a.avgRelativeVolume != null);

  if (plottable.length === 0) {
    return <p className="font-mono text-xs text-muted">暂无足够数据绘制象限图</p>;
  }

  const xValues = plottable.map((a) => a.avgChangePct5d as number);
  const yValues = plottable.map((a) => a.avgRelativeVolume as number);
  const xMax = Math.max(Math.abs(Math.min(...xValues, -5)), Math.abs(Math.max(...xValues, 5))) * 1.2;
  const yMax = Math.max(Math.max(...yValues, 1.5) * 1.3, 2);
  const yMin = 0;

  const plotW = WIDTH - PADDING * 2;
  const plotH = HEIGHT - PADDING * 2;

  const xToPx = (x: number) => PADDING + ((x + xMax) / (xMax * 2)) * plotW;
  const yToPx = (y: number) => HEIGHT - PADDING - ((y - yMin) / (yMax - yMin)) * plotH;

  const midYPx = yToPx(1); // 相对成交量=1(正常量)的分界线
  const midXPx = xToPx(0); // 5日动量=0 的分界线

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="细分行业资金走势象限图">
      {/* 象限背景分区标签 */}
      <text x={WIDTH - PADDING} y={PADDING + 16} textAnchor="end" className="fill-bullish text-[11px] font-mono">
        资金流入 · 强势
      </text>
      <text x={PADDING} y={PADDING + 16} textAnchor="start" className="fill-bearish text-[11px] font-mono">
        资金流出 · 杀跌
      </text>
      <text x={WIDTH - PADDING} y={HEIGHT - PADDING - 8} textAnchor="end" className="fill-warning text-[11px] font-mono">
        缩量上涨 · 支撑不足
      </text>
      <text x={PADDING} y={HEIGHT - PADDING - 8} textAnchor="start" className="fill-muted text-[11px] font-mono">
        低迷 · 缺乏关注
      </text>

      {/* 分界线 */}
      <line x1={PADDING} y1={midYPx} x2={WIDTH - PADDING} y2={midYPx} stroke="var(--line)" strokeDasharray="4 4" />
      <line x1={midXPx} y1={PADDING} x2={midXPx} y2={HEIGHT - PADDING} stroke="var(--line)" strokeDasharray="4 4" />

      {/* 坐标轴边框 */}
      <rect x={PADDING} y={PADDING} width={plotW} height={plotH} fill="none" stroke="var(--line)" />

      {/* 轴标签 */}
      <text x={WIDTH / 2} y={HEIGHT - 12} textAnchor="middle" className="fill-muted text-[11px] font-mono">
        平均5日动量(%) →
      </text>
      <text
        x={16}
        y={HEIGHT / 2}
        textAnchor="middle"
        className="fill-muted text-[11px] font-mono"
        transform={`rotate(-90, 16, ${HEIGHT / 2})`}
      >
        平均相对成交量(倍) →
      </text>

      {/* 数据点 */}
      {plottable.map((a) => {
        const cx = xToPx(a.avgChangePct5d as number);
        const cy = yToPx(a.avgRelativeVolume as number);
        const color = QUADRANT_COLORS[a.quadrant];
        return (
          <g key={a.subsectorCode}>
            <circle cx={cx} cy={cy} r={7} fill={color} fillOpacity={0.85} stroke={color} strokeWidth={1.5} />
            <text x={cx} y={cy - 12} textAnchor="middle" className="fill-foreground text-[12px] font-mono font-medium">
              {TREND_SUBSECTOR_NAMES[a.subsectorCode]}
            </text>
            {a.alertCount > 0 && (
              <text x={cx} y={cy + 20} textAnchor="middle" className="fill-warning text-[10px] font-mono">
                ⚠×{a.alertCount}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

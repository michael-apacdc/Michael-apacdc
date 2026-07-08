interface PriceHistoryPoint {
  date: string;
  close: number;
  volume: number | null;
}

const WIDTH = 640;
const PADDING_X = 52;
const PRICE_TOP = 16;
const PRICE_HEIGHT = 160;
const VOLUME_TOP = PRICE_TOP + PRICE_HEIGHT + 28;
const VOLUME_HEIGHT = 70;
const HEIGHT = VOLUME_TOP + VOLUME_HEIGHT + 24;

// 近3个月收盘价折线 + 每日成交量柱状图(涨跌染色),用于量化分析页面直观展示走势,不额外引入图表库。
export default function QuantPriceChart({ points }: { points: PriceHistoryPoint[] }) {
  if (points.length < 2) {
    return <p className="font-mono text-xs text-muted">价格历史数据不足,暂无法绘制走势图</p>;
  }

  const plotW = WIDTH - PADDING_X * 2;

  const closes = points.map((p) => p.close);
  const priceMin = Math.min(...closes);
  const priceMax = Math.max(...closes);
  const priceRange = priceMax - priceMin || 1;

  const volumes = points.map((p) => p.volume ?? 0);
  const volumeMax = Math.max(...volumes, 1);

  const xStep = plotW / (points.length - 1);
  const xAt = (i: number) => PADDING_X + i * xStep;
  const yAtPrice = (v: number) => PRICE_TOP + PRICE_HEIGHT - ((v - priceMin) / priceRange) * PRICE_HEIGHT;
  const yAtVolume = (v: number) => VOLUME_HEIGHT * (v / volumeMax);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAtPrice(p.close)}`).join(" ");

  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;
  const midDate = points[Math.floor(points.length / 2)].date;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="近3个月价格与成交量走势图">
      <text x={PADDING_X} y={PRICE_TOP - 4} className="fill-muted text-[10px] font-mono">
        ${priceMax.toFixed(2)}
      </text>
      <text x={PADDING_X} y={PRICE_TOP + PRICE_HEIGHT + 10} className="fill-muted text-[10px] font-mono">
        ${priceMin.toFixed(2)}
      </text>
      <rect x={PADDING_X} y={PRICE_TOP} width={plotW} height={PRICE_HEIGHT} fill="none" stroke="var(--line)" />
      <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={1.5} />

      <text x={PADDING_X} y={VOLUME_TOP - 6} className="fill-muted text-[10px] font-mono">
        成交量
      </text>
      <rect x={PADDING_X} y={VOLUME_TOP} width={plotW} height={VOLUME_HEIGHT} fill="none" stroke="var(--line)" />
      {points.map((p, i) => {
        if (p.volume == null) return null;
        const barH = yAtVolume(p.volume);
        const up = i === 0 || p.close >= points[i - 1].close;
        return (
          <rect
            key={p.date}
            x={xAt(i) - xStep / 2.4}
            y={VOLUME_TOP + VOLUME_HEIGHT - barH}
            width={Math.max(xStep / 1.2, 1)}
            height={barH}
            fill={up ? "var(--bullish)" : "var(--bearish)"}
            fillOpacity={0.65}
          />
        );
      })}

      <text x={PADDING_X} y={HEIGHT - 6} textAnchor="start" className="fill-muted text-[10px] font-mono">
        {firstDate}
      </text>
      <text x={WIDTH / 2} y={HEIGHT - 6} textAnchor="middle" className="fill-muted text-[10px] font-mono">
        {midDate}
      </text>
      <text x={WIDTH - PADDING_X} y={HEIGHT - 6} textAnchor="end" className="fill-muted text-[10px] font-mono">
        {lastDate}
      </text>
    </svg>
  );
}

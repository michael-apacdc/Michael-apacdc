"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface TrendPoint {
  report_date: string;
  target_price_avg: number | null;
  current_price: number | null;
}

const GRID_LINE = "rgba(255, 255, 255, 0.08)";
const AXIS_TEXT = "#7d8896";

export default function TickerTrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) {
    return (
      <p className="font-mono text-xs text-muted">
        目前只有 {data.length} 天的数据,累积至少2天后才会显示趋势图。
      </p>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_LINE} />
          <XAxis dataKey="report_date" tick={{ fontSize: 11, fill: AXIS_TEXT }} stroke={GRID_LINE} />
          <YAxis
            tick={{ fontSize: 11, fill: AXIS_TEXT }}
            stroke={GRID_LINE}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: "#10141b",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 6,
              fontSize: 12,
              fontFamily: "var(--font-geist-mono)",
            }}
            labelStyle={{ color: "#e4e7ec" }}
          />
          <Legend wrapperStyle={{ fontSize: 12, fontFamily: "var(--font-geist-mono)" }} />
          <Line
            type="monotone"
            dataKey="current_price"
            name="现价"
            stroke="#e4e7ec"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="target_price_avg"
            name="目标价(均值)"
            stroke="#2dd4ee"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

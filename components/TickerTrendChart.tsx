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

export default function TickerTrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) {
    return (
      <p className="text-sm text-slate-400">
        目前只有 {data.length} 天的数据,累积至少2天后才会显示趋势图。
      </p>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="report_date" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} domain={["auto", "auto"]} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="current_price"
            name="现价"
            stroke="#0f172a"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="target_price_avg"
            name="目标价(均值)"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

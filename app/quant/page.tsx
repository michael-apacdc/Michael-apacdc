"use client";

import { useState } from "react";
import FScoreCard from "@/components/FScoreCard";
import ZScoreCard from "@/components/ZScoreCard";

interface QuantResult {
  symbol: string;
  companyName: string;
  currentPrice: number | null;
  marketCap: number | null;
  dataYears: { current: string; prior: string };
  valuation: {
    peRatio: number | null;
    priceToBook: number | null;
    evToEbitda: number | null;
  };
  fScore: { score: number; maxScore: number; criteria: { key: string; label: string; passed: boolean; detail: string }[] };
  zScore: { score: number; zone: string; components: { label: string; value: number }[] };
}

function fmt(n: number | null, digits = 2): string {
  return n == null ? "N/A" : n.toFixed(digits);
}

function fmtMarketCap(n: number | null): string {
  if (n == null) return "N/A";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}万亿`;
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}亿`;
  return n.toLocaleString();
}

export default function QuantPage() {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QuantResult | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = symbol.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/quant?symbol=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "查询失败");
      } else {
        setResult(data);
      }
    } catch {
      setError("网络请求失败,请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div>
        <p className="font-mono text-xs text-muted">QUANTITATIVE ANALYSIS</p>
        <h1 className="mt-1 font-mono text-2xl font-semibold tracking-tight text-foreground">
          量化分析
        </h1>
        <p className="mt-1 text-sm text-muted">
          输入美股代码,基于 Piotroski F-Score 与 Altman Z-Score 两个经典公开量化模型实时打分
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-3">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="输入股票代码,例如 NVDA"
          className="flex-1 rounded-md border border-line bg-surface px-4 py-2.5 font-mono text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md border border-accent/30 bg-accent-dim px-5 py-2.5 font-mono text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
        >
          {loading ? "分析中..." : "分析"}
        </button>
      </form>

      {error && (
        <p className="rounded-md border border-bearish/30 bg-bearish/10 px-4 py-3 font-mono text-xs text-bearish">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-6">
          <div className="rounded-md border border-line bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="font-mono text-lg font-semibold text-foreground">{result.symbol}</span>
                <span className="ml-2 text-sm text-muted">{result.companyName}</span>
              </div>
              <div className="font-mono text-sm text-foreground">
                ${fmt(result.currentPrice)}
                <span className="ml-3 text-xs text-muted">市值 {fmtMarketCap(result.marketCap)}</span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs">
              <div className="rounded border border-line bg-background/40 p-2 text-center">
                <div className="text-foreground">{fmt(result.valuation.peRatio)}</div>
                <div className="text-[10px] text-muted">PE (TTM)</div>
              </div>
              <div className="rounded border border-line bg-background/40 p-2 text-center">
                <div className="text-foreground">{fmt(result.valuation.priceToBook)}</div>
                <div className="text-[10px] text-muted">P/B (TTM)</div>
              </div>
              <div className="rounded border border-line bg-background/40 p-2 text-center">
                <div className="text-foreground">{fmt(result.valuation.evToEbitda)}</div>
                <div className="text-[10px] text-muted">EV/EBITDA (TTM)</div>
              </div>
            </div>
            <p className="mt-2 font-mono text-[11px] text-muted">
              财报对比区间:{result.dataYears.prior} → {result.dataYears.current}
            </p>
          </div>

          <FScoreCard
            score={result.fScore.score}
            maxScore={result.fScore.maxScore}
            criteria={result.fScore.criteria}
          />
          <ZScoreCard score={result.zScore.score} zone={result.zScore.zone} components={result.zScore.components} />

          <p className="rounded-md border border-warning/25 bg-warning/5 p-4 font-mono text-[11px] leading-relaxed text-warning/90">
            以上评分基于 Piotroski (2000) 与 Altman (1968) 两个公开发表的经典量化模型,用最近两个财年的公开财报数据按固定公式计算,不涉及AI主观判断,仅供研究参考,不构成正式投资建议。Altman
            Z-Score 原始模型主要针对制造业上市公司设计,应用到其他行业时数值仅供参考。
          </p>
        </div>
      )}
    </div>
  );
}

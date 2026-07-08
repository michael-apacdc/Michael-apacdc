"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import FScoreCard from "@/components/FScoreCard";
import ZScoreCard from "@/components/ZScoreCard";
import QuantPriceChart from "@/components/QuantPriceChart";

type MoneyFlowQuadrant = "inflow" | "outflow" | "weak_rally" | "quiet";

interface PriceTrend {
  points: { date: string; close: number; volume: number | null }[];
  changePct1d: number | null;
  changePct5d: number | null;
  changePct20d: number | null;
  avgVolume20d: number | null;
  latestVolume: number | null;
  relativeVolume: number | null;
  quadrant: MoneyFlowQuadrant;
  quadrantLabel: string;
}

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
  priceTrend: PriceTrend | null;
  dataSourceNote: string | null;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const QUADRANT_STYLES: Record<MoneyFlowQuadrant, string> = {
  inflow: "bg-bullish/10 text-bullish border-bullish/30",
  outflow: "bg-bearish/10 text-bearish border-bearish/30",
  weak_rally: "bg-warning/10 text-warning border-warning/30",
  quiet: "bg-white/5 text-muted border-line-strong",
};

function fmtPct(n: number | null): string {
  if (n == null) return "N/A";
  return `${n > 0 ? "+" : ""}${n}%`;
}

function pctColor(n: number | null): string {
  if (n == null) return "text-muted";
  if (n > 0) return "text-bullish";
  if (n < 0) return "text-bearish";
  return "text-muted";
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

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = symbol.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setChatHistory([]);
    setAskError(null);

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

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || !result) return;

    const nextHistory: ChatTurn[] = [...chatHistory, { role: "user", content: trimmed }];
    setChatHistory(nextHistory);
    setQuestion("");
    setAsking(true);
    setAskError(null);

    try {
      const res = await fetch("/api/quant/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          history: chatHistory,
          context: {
            symbol: result.symbol,
            companyName: result.companyName,
            currentPrice: result.currentPrice,
            marketCap: result.marketCap,
            valuation: result.valuation,
            fScore: { score: result.fScore.score, maxScore: result.fScore.maxScore },
            zScore: { score: result.zScore.score, zone: result.zScore.zone },
            priceTrend: result.priceTrend
              ? {
                  changePct1d: result.priceTrend.changePct1d,
                  changePct5d: result.priceTrend.changePct5d,
                  changePct20d: result.priceTrend.changePct20d,
                  relativeVolume: result.priceTrend.relativeVolume,
                  quadrantLabel: result.priceTrend.quadrantLabel,
                }
              : null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAskError(data.error ?? "提问失败");
        setChatHistory((prev) => prev.slice(0, -1));
      } else {
        setChatHistory((prev) => [...prev, { role: "assistant", content: data.answer }]);
      }
    } catch {
      setAskError("网络请求失败,请稍后重试");
      setChatHistory((prev) => prev.slice(0, -1));
    } finally {
      setAsking(false);
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
                <div className="text-[10px] text-muted">PE(最近财年)</div>
              </div>
              <div className="rounded border border-line bg-background/40 p-2 text-center">
                <div className="text-foreground">{fmt(result.valuation.priceToBook)}</div>
                <div className="text-[10px] text-muted">P/B(最近财年)</div>
              </div>
              <div className="rounded border border-line bg-background/40 p-2 text-center">
                <div className="text-foreground">{fmt(result.valuation.evToEbitda)}</div>
                <div className="text-[10px] text-muted">EV/EBITDA</div>
              </div>
            </div>
            <p className="mt-2 font-mono text-[11px] text-muted">
              财报对比区间:{result.dataYears.prior} → {result.dataYears.current}(数据来自 SEC EDGAR 官方财报)
            </p>
            {result.dataSourceNote && (
              <p className="mt-1 font-mono text-[11px] text-warning">{result.dataSourceNote}</p>
            )}
          </div>

          {result.priceTrend && (
            <div className="rounded-md border border-line bg-surface p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-mono text-sm font-semibold text-foreground">近期价格与资金走势</h3>
                <span
                  className={`rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${QUADRANT_STYLES[result.priceTrend.quadrant]}`}
                >
                  {result.priceTrend.quadrantLabel}
                </span>
              </div>
              <div className="mb-4 grid grid-cols-4 gap-2 font-mono text-xs">
                <div className="rounded border border-line bg-background/40 p-2 text-center">
                  <div className={pctColor(result.priceTrend.changePct1d)}>{fmtPct(result.priceTrend.changePct1d)}</div>
                  <div className="text-[10px] text-muted">1日涨跌</div>
                </div>
                <div className="rounded border border-line bg-background/40 p-2 text-center">
                  <div className={pctColor(result.priceTrend.changePct5d)}>{fmtPct(result.priceTrend.changePct5d)}</div>
                  <div className="text-[10px] text-muted">5日涨跌</div>
                </div>
                <div className="rounded border border-line bg-background/40 p-2 text-center">
                  <div className={pctColor(result.priceTrend.changePct20d)}>{fmtPct(result.priceTrend.changePct20d)}</div>
                  <div className="text-[10px] text-muted">20日涨跌</div>
                </div>
                <div className="rounded border border-line bg-background/40 p-2 text-center">
                  <div className="text-foreground">
                    {result.priceTrend.relativeVolume != null ? `${result.priceTrend.relativeVolume}x` : "N/A"}
                  </div>
                  <div className="text-[10px] text-muted">相对成交量</div>
                </div>
              </div>
              <QuantPriceChart points={result.priceTrend.points} />
              <p className="mt-2 font-mono text-[10px] text-muted">
                相对成交量=最新交易日成交量÷20日均量,资金走势象限用5日动量×相对成交量归类(与&ldquo;美股趋势研判&rdquo;模块同一套口径),数据来自 Yahoo
                Finance,仅为免费代理指标,不是真实机构资金流数据。
              </p>
            </div>
          )}

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

          <div className="rounded-md border border-line bg-surface p-5">
            <h3 className="mb-3 font-mono text-sm font-semibold text-foreground">进一步提问</h3>

            {chatHistory.length > 0 && (
              <div className="mb-4 space-y-3">
                {chatHistory.map((turn, i) => (
                  <div
                    key={i}
                    className={
                      turn.role === "user"
                        ? "rounded border border-line-strong bg-background/40 px-3 py-2 font-mono text-xs text-foreground"
                        : "prose prose-invert prose-sm max-w-none rounded border border-accent/20 bg-accent-dim/40 px-3 py-2 prose-a:text-accent prose-a:no-underline hover:prose-a:underline"
                    }
                  >
                    {turn.role === "user" ? (
                      <>Q: {turn.content}</>
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.content}</ReactMarkdown>
                    )}
                  </div>
                ))}
              </div>
            )}

            {askError && (
              <p className="mb-3 rounded-md border border-bearish/30 bg-bearish/10 px-3 py-2 font-mono text-xs text-bearish">
                {askError}
              </p>
            )}

            <form onSubmit={handleAsk} className="flex gap-3">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={`就 ${result.symbol} 的数据提一个问题,例如:F-Score为什么不高?`}
                className="flex-1 rounded-md border border-line bg-background/40 px-4 py-2.5 font-mono text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                disabled={asking}
                className="rounded-md border border-accent/30 bg-accent-dim px-5 py-2.5 font-mono text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
              >
                {asking ? "思考中..." : "提问"}
              </button>
            </form>
            <p className="mt-2 font-mono text-[10px] text-muted">
              回答由 Claude 基于上面已计算出的量化数据生成,仅做数据解读,不构成买卖建议。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createPublicClient } from "@/lib/supabase";
import type {
  AiQuantPickRow,
  AiQuantScoreRow,
  AiQuantSnapshotRow,
  AiQuantValidationRow,
} from "@/lib/types";
import AiQuantRankTable from "@/components/AiQuantRankTable";
import AiQuantValidationTable from "@/components/AiQuantValidationTable";
import Disclaimer from "@/components/Disclaimer";

export const dynamic = "force-dynamic";

const WEIGHT_LABELS: Record<string, string> = {
  resid_mom: "残差动量",
  reversal: "短期反转",
  mom_120: "中期动量",
  prox_high: "距高点",
  vol_trend: "量能",
  low_vol: "低波动",
};

function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n == null) return "—";
  return `${n > 0 ? "+" : ""}${Number(n).toFixed(digits)}%`;
}

export default async function AiQuantPage() {
  const supabase = createPublicClient();

  const { data: latest, error: latestError } = await supabase
    .from("ai_quant_snapshot")
    .select("*")
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="mb-2 font-mono text-lg font-semibold text-bearish">数据库连接失败</h1>
        <p className="font-mono text-xs text-muted">{latestError.message}</p>
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="mb-2 font-mono text-lg font-semibold text-foreground">模型尚未开始运行</h1>
        <p className="font-mono text-xs text-muted">
          先在 Supabase 执行 schema_aiquant.sql 建表,然后在 GitHub Actions 手动触发一次
          &ldquo;Daily Data Center Report Pipeline&rdquo;,或本地运行 npm run pipeline:aiquant。
        </p>
      </div>
    );
  }

  const snapshot = latest as AiQuantSnapshotRow;
  const reportDate = snapshot.report_date;

  const [{ data: scores }, { data: picks }, { data: recentPicks }, { data: validation }] =
    await Promise.all([
      supabase.from("ai_quant_scores").select("*").eq("report_date", reportDate),
      supabase
        .from("ai_quant_picks")
        .select("*")
        .eq("report_date", reportDate)
        .order("rank_position", { ascending: true }),
      supabase
        .from("ai_quant_picks")
        .select("*")
        .eq("resolved", true)
        .order("report_date", { ascending: false })
        .limit(25),
      supabase.from("ai_quant_validation").select("*"),
    ]);

  const todayPicks = (picks as AiQuantPickRow[] | null) ?? [];
  const pickedTickers = new Set(todayPicks.map((p) => p.ticker));
  const liveHitRate =
    snapshot.resolved_picks > 0 ? (snapshot.resolved_hits / snapshot.resolved_picks) * 100 : null;

  const weightBits = Object.entries(snapshot.weights ?? {})
    .filter(([, v]) => v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([k, v]) => `${WEIGHT_LABELS[k] ?? k} ${v > 0 ? "+" : ""}${v.toFixed(2)}`)
    .join(" · ");

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <div>
        <p className="font-mono text-xs text-muted">AI RELATIVE STRENGTH · PAPER TRACKING</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground">
            AI板块相对强弱模型
          </h1>
          <span className="rounded border border-warning/30 bg-warning/10 px-2 py-0.5 font-mono text-[11px] font-medium text-warning">
            观察验证模式 · 未转正
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">
          {reportDate} · 29支AI产业链美股 · 预测未来5个交易日相对板块强弱 · 权重每日自动重估
        </p>
      </div>

      <section className="rounded-md border border-warning/25 bg-warning/5 p-5">
        <h2 className="mb-2 font-mono text-xs uppercase tracking-wide text-warning">
          为什么是"观察验证模式"
        </h2>
        <p className="text-sm leading-relaxed text-foreground/90">
          本模型在发布前做了 2022~2026 年共 18 个季度、216
          个调仓窗口的滚动样本外检验(见页面底部),窗口胜率
          51.9%,统计上与随机无异,累计跑输直接持有等权AI板块。
          <strong className="text-warning">因此它的输出目前不构成买卖依据。</strong>
          它现在做的事:每天照常打分并公布强势名单,5个交易日后自动回填每条信号的真实结果、在下方公示实盘成功率
          —— 用真实行情自证。转正标准:累计≥60个信号日、按信号日聚合的胜率≥58%且平均超额为正。
        </p>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="font-mono text-xs text-accent">A</span>
          <span className="h-px flex-1 bg-line" />
          <h2 className="text-sm font-medium tracking-wide text-foreground">实盘追踪成绩</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border border-line bg-surface p-4">
            <p className="font-mono text-[11px] uppercase text-muted">信号成功率</p>
            <p className="mt-1 font-mono text-xl font-semibold text-foreground">
              {liveHitRate != null ? `${liveHitRate.toFixed(1)}%` : "待积累"}
            </p>
            <p className="font-mono text-[11px] text-muted">
              {snapshot.resolved_hits}/{snapshot.resolved_picks} 条跑赢板块
            </p>
          </div>
          <div className="rounded-md border border-line bg-surface p-4">
            <p className="font-mono text-[11px] uppercase text-muted">平均超额收益</p>
            <p
              className={`mt-1 font-mono text-xl font-semibold ${(snapshot.avg_excess_pct ?? 0) >= 0 ? "text-bullish" : "text-bearish"}`}
            >
              {fmtPct(snapshot.avg_excess_pct)}
            </p>
            <p className="font-mono text-[11px] text-muted">每条信号5日 vs 板块</p>
          </div>
          <div className="rounded-md border border-line bg-surface p-4">
            <p className="font-mono text-[11px] uppercase text-muted">信号日胜率</p>
            <p className="mt-1 font-mono text-xl font-semibold text-foreground">
              {snapshot.day_windows > 0
                ? `${((snapshot.day_wins / snapshot.day_windows) * 100).toFixed(0)}%`
                : "待积累"}
            </p>
            <p className="font-mono text-[11px] text-muted">
              {snapshot.day_wins}/{snapshot.day_windows} 天前5名单平均跑赢
            </p>
          </div>
          <div className="rounded-md border border-line bg-surface p-4">
            <p className="font-mono text-[11px] uppercase text-muted">转正进度</p>
            <p className="mt-1 font-mono text-xl font-semibold text-foreground">
              {Math.min(100, Math.round((snapshot.day_windows / 60) * 100))}%
            </p>
            <p className="font-mono text-[11px] text-muted">{snapshot.day_windows}/60 个信号日</p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="font-mono text-xs text-accent">B</span>
          <span className="h-px flex-1 bg-line" />
          <h2 className="text-sm font-medium tracking-wide text-foreground">当日强势名单(前5)</h2>
        </div>
        {todayPicks.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {todayPicks.map((p) => (
              <div key={p.ticker} className="rounded-md border border-accent/25 bg-accent/5 p-4">
                <p className="font-mono text-[11px] text-muted">#{p.rank_position}</p>
                <p className="font-mono text-lg font-semibold text-foreground">{p.ticker}</p>
                <p className="font-mono text-[11px] text-muted">得分 {p.score?.toFixed(2) ?? "—"}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="font-mono text-xs text-muted">今日名单尚未生成</p>
        )}
        <p className="mt-2 font-mono text-[11px] text-muted">
          名单约束:每个子板块最多2支;中期动量垫底25%不入选。当日因子权重:{weightBits || "—"}
        </p>
      </section>

      {snapshot.commentary_md && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <span className="font-mono text-xs text-accent">C</span>
            <span className="h-px flex-1 bg-line" />
            <h2 className="text-sm font-medium tracking-wide text-foreground">Claude 当日解读</h2>
          </div>
          <div className="rounded-md border border-line bg-surface p-5">
            <div className="prose prose-invert prose-sm max-w-none prose-a:text-accent">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{snapshot.commentary_md}</ReactMarkdown>
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="font-mono text-xs text-accent">D</span>
          <span className="h-px flex-1 bg-line" />
          <h2 className="text-sm font-medium tracking-wide text-foreground">当日完整排名</h2>
        </div>
        <AiQuantRankTable
          scores={(scores as AiQuantScoreRow[] | null) ?? []}
          pickedTickers={pickedTickers}
        />
      </section>

      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="font-mono text-xs text-accent">E</span>
          <span className="h-px flex-1 bg-line" />
          <h2 className="text-sm font-medium tracking-wide text-foreground">最近已回填的信号</h2>
        </div>
        {((recentPicks as AiQuantPickRow[] | null) ?? []).length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-line bg-surface">
            <table className="w-full font-mono text-[13px]">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2">信号日</th>
                  <th className="px-4 py-2">代码</th>
                  <th className="px-4 py-2">5日个股</th>
                  <th className="px-4 py-2">5日板块</th>
                  <th className="px-4 py-2">超额</th>
                  <th className="px-4 py-2">结果</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {((recentPicks as AiQuantPickRow[] | null) ?? []).map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-surface-hover">
                    <td className="px-4 py-2 text-muted">{p.report_date}</td>
                    <td className="px-4 py-2 font-semibold text-foreground">{p.ticker}</td>
                    <td className="px-4 py-2 text-foreground">{fmtPct(p.fwd_return_pct)}</td>
                    <td className="px-4 py-2 text-muted">{fmtPct(p.basket_return_pct)}</td>
                    <td
                      className={`px-4 py-2 ${(p.excess_return_pct ?? 0) >= 0 ? "text-bullish" : "text-bearish"}`}
                    >
                      {fmtPct(p.excess_return_pct)}
                    </td>
                    <td className="px-4 py-2">
                      {p.hit ? (
                        <span className="text-bullish">✓ 跑赢</span>
                      ) : (
                        <span className="text-bearish">✗ 跑输</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="font-mono text-xs text-muted">
            信号需要5个交易日后才能回填真实结果,模型刚启动时这里为空
          </p>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="font-mono text-xs text-accent">F</span>
          <span className="h-px flex-1 bg-line" />
          <h2 className="text-sm font-medium tracking-wide text-foreground">
            发布前的滚动样本外检验(2022~2026)
          </h2>
        </div>
        <p className="mb-3 font-mono text-[11px] leading-relaxed text-muted">
          每个季度都只用该季度之前的数据自动定权重、再在该季度上模拟(全程无未来信息)。合计216个窗口、
          胜率51.9%(95%置信区间45.2%~58.5%),统计上与抛硬币无法区分 ——
          这就是本模型不作为正式买卖依据、需要实盘自证的原因。单季度的好成绩(如2026-Q1、2026-Q2)不可外推。
        </p>
        <AiQuantValidationTable rows={(validation as AiQuantValidationRow[] | null) ?? []} />
      </section>

      <Disclaimer content="本页面是量化研究工具,处于观察验证模式:模型输出(排名、强势名单)由程序按公开价量因子自动计算,Claude 仅做解读;发布前的滚动样本外检验结论为'无统计学意义的选股优势',页面如实展示该结论与实盘追踪成绩。在实盘追踪达标转正之前,任何名单都不构成投资建议。数据来自 Yahoo Finance / Tiingo 公开接口,可能存在延迟或错误。投资决策请自行判断并自担风险。" />
    </div>
  );
}

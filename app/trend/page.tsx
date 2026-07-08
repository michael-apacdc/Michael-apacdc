import { createPublicClient } from "@/lib/supabase";
import type { TrendSubsectorSnapshot, TrendTickerSignal } from "@/lib/types";
import { TREND_SUBSECTOR_CODES, TREND_SUBSECTOR_NAMES, computeSubsectorAggregate } from "@/lib/trendSubsectors";
import TrendSubsectorCard from "@/components/TrendSubsectorCard";
import TrendSignalTable from "@/components/TrendSignalTable";
import TrendQuadrantChart from "@/components/TrendQuadrantChart";
import Disclaimer from "@/components/Disclaimer";

export const dynamic = "force-dynamic";

export default async function TrendPage() {
  const supabase = createPublicClient();

  const { data: latest, error: latestError } = await supabase
    .from("trend_subsector_snapshot")
    .select("report_date")
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
        <h1 className="mb-2 font-mono text-lg font-semibold text-foreground">尚无趋势研判数据</h1>
        <p className="font-mono text-xs text-muted">
          每日趋势研判流水线还没有运行过。可以在 GitHub Actions 里手动触发一次
          &ldquo;Daily Data Center Report Pipeline&rdquo; 来生成第一份分析。
        </p>
      </div>
    );
  }

  const reportDate = latest.report_date;

  const [{ data: snapshots }, { data: signals }] = await Promise.all([
    supabase.from("trend_subsector_snapshot").select("*").eq("report_date", reportDate),
    supabase
      .from("trend_ticker_signal")
      .select("*")
      .eq("report_date", reportDate)
      .order("ticker", { ascending: true }),
  ]);

  const snapshotByCode = new Map<string, TrendSubsectorSnapshot>(
    (snapshots as TrendSubsectorSnapshot[] | null)?.map((s) => [s.subsector_code, s]) ?? []
  );
  const signalsByCode = new Map<string, TrendTickerSignal[]>();
  for (const s of (signals as TrendTickerSignal[] | null) ?? []) {
    const list = signalsByCode.get(s.subsector_code) ?? [];
    list.push(s);
    signalsByCode.set(s.subsector_code, list);
  }

  const totalAlerts = (signals as TrendTickerSignal[] | null)?.filter((s) => s.alert_flag).length ?? 0;

  const aggregates = TREND_SUBSECTOR_CODES.map((code) =>
    computeSubsectorAggregate(code, signalsByCode.get(code) ?? [])
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <div>
        <p className="font-mono text-xs text-muted">TREND RESEARCH &amp; ALERTS</p>
        <h1 className="mt-1 font-mono text-2xl font-semibold tracking-tight text-foreground">
          美股趋势研判与预警
        </h1>
        <p className="mt-1 text-sm text-muted">
          {reportDate} · AI产业链细分:芯片、光模块、数据中心、存储、液冷、能源
          {totalAlerts > 0 && <span className="ml-2 text-warning">· 今日共 {totalAlerts} 项预警</span>}
        </p>
      </div>

      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="font-mono text-xs text-accent">A</span>
          <span className="h-px flex-1 bg-line" />
          <h2 className="text-sm font-medium tracking-wide text-foreground">资金走势象限图</h2>
        </div>
        <div className="rounded-md border border-line bg-surface p-5">
          <TrendQuadrantChart aggregates={aggregates} />
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="font-mono text-xs text-accent">B</span>
          <span className="h-px flex-1 bg-line" />
          <h2 className="text-sm font-medium tracking-wide text-foreground">细分行业逐一研判</h2>
        </div>
        <div className="space-y-6">
        {TREND_SUBSECTOR_CODES.map((code) => {
          const snapshot = snapshotByCode.get(code) ?? null;
          const tickerSignals = signalsByCode.get(code) ?? [];
          const alertCount = tickerSignals.filter((s) => s.alert_flag).length;
          const aggregate = aggregates.find((a) => a.subsectorCode === code)!;
          return (
            <div key={code} className="space-y-3">
              <TrendSubsectorCard
                name={TREND_SUBSECTOR_NAMES[code]}
                snapshot={snapshot}
                alertCount={alertCount}
                aggregate={aggregate}
              />
              <TrendSignalTable signals={tickerSignals} />
            </div>
          );
        })}
        </div>
      </section>

      <Disclaimer content="此模块的“趋势研判”是基于公开新闻与价格/成交量的免费代理指标(相对成交量等)由AI综合解读的方向性研究,不是量化预测模型,也没有经过历史回测验证准确率;真实的机构资金流数据通常为付费终端提供,这里未使用。预警标记由程序按固定规则(单日涨跌超过5%或成交量超过20日均量2.5倍)自动触发,仅提示需要关注,不代表买卖建议。仅供研究参考,不构成正式投资建议。" />
    </div>
  );
}

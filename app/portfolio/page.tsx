import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createPublicClient } from "@/lib/supabase";
import type {
  PortfolioBacktestRow,
  PortfolioHolding,
  PortfolioSignal,
  PortfolioSnapshot,
} from "@/lib/types";
import PortfolioSignalTable from "@/components/PortfolioSignalTable";
import PortfolioBacktestTable from "@/components/PortfolioBacktestTable";
import Disclaimer from "@/components/Disclaimer";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const supabase = createPublicClient();

  const { data: latest, error: latestError } = await supabase
    .from("portfolio_snapshot")
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
        <h1 className="mb-2 font-mono text-lg font-semibold text-foreground">尚无持仓监控数据</h1>
        <p className="font-mono text-xs text-muted">
          持仓量化流水线还没有运行过。先在 Supabase 执行 schema_portfolio.sql 建表,然后在 GitHub
          Actions 手动触发一次 &ldquo;Daily Data Center Report Pipeline&rdquo;,或本地运行 npm run
          pipeline:portfolio。
        </p>
      </div>
    );
  }

  const snapshot = latest as PortfolioSnapshot;
  const reportDate = snapshot.report_date;

  const [{ data: holdings }, { data: signals }, { data: backtests }] = await Promise.all([
    supabase.from("portfolio_holdings").select("*").eq("active", true),
    supabase
      .from("portfolio_signal")
      .select("*")
      .eq("report_date", reportDate)
      .order("momentum_rank", { ascending: true }),
    supabase.from("portfolio_backtest").select("*"),
  ]);

  const holdingsByTicker = new Map<string, PortfolioHolding>(
    ((holdings as PortfolioHolding[] | null) ?? []).map((h) => [h.ticker, h])
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <div>
        <p className="font-mono text-xs text-muted">MY PORTFOLIO · QUANT MONITOR</p>
        <h1 className="mt-1 font-mono text-2xl font-semibold tracking-tight text-foreground">
          我的持仓量化监控
        </h1>
        <p className="mt-1 text-sm text-muted">
          {reportDate} · 趋势过滤 + 动量轮动 + 回撤止损,每日自动计算
          {snapshot.total_alerts > 0 && (
            <span className="ml-2 text-warning">· 今日共 {snapshot.total_alerts} 项信号</span>
          )}
          {snapshot.email_sent && <span className="ml-2 text-muted">· 预警邮件已发送</span>}
        </p>
      </div>

      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="font-mono text-xs text-accent">A</span>
          <span className="h-px flex-1 bg-line" />
          <h2 className="text-sm font-medium tracking-wide text-foreground">持仓信号总览</h2>
        </div>
        <PortfolioSignalTable
          signals={(signals as PortfolioSignal[] | null) ?? []}
          holdingsByTicker={holdingsByTicker}
        />
      </section>

      {(snapshot.commentary_md || snapshot.rotation_md) && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <span className="font-mono text-xs text-accent">B</span>
            <span className="h-px flex-1 bg-line" />
            <h2 className="text-sm font-medium tracking-wide text-foreground">Claude 每日点评</h2>
          </div>
          <div className="space-y-4">
            {snapshot.commentary_md && (
              <div className="rounded-md border border-line bg-surface p-5">
                <h3 className="mb-2 font-mono text-xs uppercase tracking-wide text-muted">
                  信号解读
                </h3>
                <div className="prose prose-invert prose-sm max-w-none prose-a:text-accent">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{snapshot.commentary_md}</ReactMarkdown>
                </div>
              </div>
            )}
            {snapshot.rotation_md && (
              <div className="rounded-md border border-line bg-surface p-5">
                <h3 className="mb-2 font-mono text-xs uppercase tracking-wide text-muted">
                  轮动执行提示
                </h3>
                <div className="prose prose-invert prose-sm max-w-none prose-a:text-accent">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{snapshot.rotation_md}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="font-mono text-xs text-accent">C</span>
          <span className="h-px flex-1 bg-line" />
          <h2 className="text-sm font-medium tracking-wide text-foreground">
            规则回测(约10年历史)
          </h2>
        </div>
        <p className="mb-3 font-mono text-[11px] leading-relaxed text-muted">
          同一套信号规则在历史数据上的模拟表现,和买入持有基准对比。回测未计入交易成本与税,
          实际执行收益会低于回测值;历史表现不代表未来收益。如果某个策略在某支持仓上长期跑输买入持有,
          对该持仓的对应信号就应打折看待。
        </p>
        <PortfolioBacktestTable rows={(backtests as PortfolioBacktestRow[] | null) ?? []} />
      </section>

      <Disclaimer content="此页面的买卖建议由程序按固定量化规则(200日均线趋势过滤、50/200金叉死叉、12-1月动量轮动、52周回撤止损线、RSI极值、异常放量)自动计算,Claude 仅对程序信号做解读、不产生独立买卖判断。所有规则均附带同口径历史回测供检验,但回测存在过拟合与幸存者偏差风险,且未计交易成本。持仓为用户自行录入,数据来自 Tiingo / Yahoo Finance 公开接口,可能存在延迟或错误。仅供个人研究参考,不构成正式投资建议;任何交易决策请自行判断并自担风险。" />
    </div>
  );
}

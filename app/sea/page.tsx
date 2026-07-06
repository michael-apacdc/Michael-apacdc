import { createPublicClient } from "@/lib/supabase";
import type { SeaCountryOutlook, SeaDeal } from "@/lib/types";
import SeaCountryCard from "@/components/SeaCountryCard";
import SeaDealCard from "@/components/SeaDealCard";
import Disclaimer from "@/components/Disclaimer";

export const dynamic = "force-dynamic";

export default async function SeaPage() {
  const supabase = createPublicClient();

  const { data: latest, error: latestError } = await supabase
    .from("sea_country_outlook")
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
        <h1 className="mb-2 font-mono text-lg font-semibold text-foreground">尚无选址分析数据</h1>
        <p className="font-mono text-xs text-muted">
          每日选址分析流水线还没有运行过。可以在 GitHub Actions 里手动触发一次
          &ldquo;Daily Data Center Report Pipeline&rdquo; 来生成第一份分析。
        </p>
      </div>
    );
  }

  const reportDate = latest.report_date;

  const [{ data: outlooks }, { data: deals }] = await Promise.all([
    supabase
      .from("sea_country_outlook")
      .select("*")
      .eq("report_date", reportDate)
      .order("rank_position", { ascending: true }),
    supabase
      .from("sea_deals")
      .select("*")
      .eq("report_date", reportDate)
      .order("overall_score", { ascending: false, nullsFirst: false }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <div>
        <p className="font-mono text-xs text-muted">SITE SELECTION ANALYSIS</p>
        <h1 className="mt-1 font-mono text-2xl font-semibold tracking-tight text-foreground">
          亚太数据中心选址分析
        </h1>
        <p className="mt-1 text-sm text-muted">
          {reportDate} · 覆盖新加坡、马来西亚、泰国、印度尼西亚、日本、澳大利亚
        </p>
      </div>

      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="font-mono text-xs text-accent">A</span>
          <span className="h-px flex-1 bg-line" />
          <h2 className="text-sm font-medium tracking-wide text-foreground">区域投资热度排名</h2>
        </div>
        {outlooks && outlooks.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(outlooks as SeaCountryOutlook[]).map((o) => (
              <SeaCountryCard key={o.country_code} outlook={o} />
            ))}
          </div>
        ) : (
          <p className="font-mono text-xs text-muted">暂无国家层面判断数据</p>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="font-mono text-xs text-accent">B</span>
          <span className="h-px flex-1 bg-line" />
          <h2 className="text-sm font-medium tracking-wide text-foreground">
            逐条土地/电力交易评分明细
          </h2>
        </div>
        {deals && deals.length > 0 ? (
          <div className="space-y-4">
            {(deals as SeaDeal[]).map((deal) => (
              <SeaDealCard key={deal.id} deal={deal} />
            ))}
          </div>
        ) : (
          <p className="font-mono text-xs text-muted">
            今日未发现符合条件的具体拿地/电力交易新闻
          </p>
        )}
      </section>

      <Disclaimer content="此分析基于公开新闻信息与用户提供的选址评估框架生成,新闻未披露的技术指标(如具体电力容量、地块面积、湿球温度等)标注为信息不足,不代表实际不满足要求,仅供研究参考,不构成正式选址或投资建议。" />
    </div>
  );
}

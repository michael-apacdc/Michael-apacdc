import Anthropic from "@anthropic-ai/sdk";
import type {
  RawTrendReport,
  RawTrendSignal,
  RawTrendSubsectorJudgment,
  ResolvedTrendReport,
  ResolvedTrendSubsectorJudgment,
  TrendSubsectorCode,
} from "../lib/types";
import type { RawTrendNewsItem } from "./fetchTrendNews";
import { buildUrlIndex, resolveCitationsInText, resolveNewsIds } from "./citations";
import { TREND_SUBSECTOR_CODES, TREND_SUBSECTOR_NAMES } from "./trendTickers";
import { computeSubsectorAggregate, MONEY_FLOW_QUADRANT_LABELS } from "../lib/trendSubsectors";

const MODEL = "claude-haiku-4-5-20251001";

const TREND_TOOL = {
  name: "submit_trend_analysis",
  description: "提交美股AI产业细分趋势研判与预警(六个细分行业)",
  input_schema: {
    type: "object" as const,
    properties: {
      subsectors: {
        type: "array",
        description: "对全部6个细分行业(芯片/光模块/数据中心/存储/液冷/能源)的趋势研判,必须每个都覆盖",
        items: {
          type: "object",
          properties: {
            subsector_code: {
              type: "string",
              enum: ["chip", "optical", "datacenter", "storage", "liquid_cooling", "energy"],
            },
            trend_direction: {
              type: "string",
              enum: ["warming", "cooling", "stable", "mixed"],
              description: "warming=行业热度上升 cooling=降温 stable=平稳 mixed=分化不一致",
            },
            summary_md: {
              type: "string",
              description: "150字以内的趋势研判,结合新闻和下面提供的价格/成交量信号,用[编号]引用来源",
            },
            alert_summary_md: {
              type: ["string", "null"],
              description: "如果该细分行业有个股被标记为预警(anomaly_flag=true),在这里结合新闻解读可能原因;如果没有预警个股,填null,不要编造预警",
            },
            source_news_ids: {
              type: "array",
              items: { type: "integer" },
              description: "支撑该判断的新闻编号列表",
            },
          },
          required: ["subsector_code", "trend_direction", "summary_md", "alert_summary_md", "source_news_ids"],
        },
      },
    },
    required: ["subsectors"],
  },
};

function buildPrompt(news: RawTrendNewsItem[], signals: RawTrendSignal[], reportDate: string): string {
  const newsBlock = news
    .map(
      (n, i) =>
        `[${i + 1}] [${n.subsector_code}] ${n.headline}\n   来源: ${n.source_name}\n   摘要: ${n.raw_snippet ?? "(无摘要)"}`
    )
    .join("\n\n");

  const signalsBySubsector = TREND_SUBSECTOR_CODES.map((code) => {
    const subsectorSignals = signals.filter((s) => s.subsector_code === code);
    const rows = subsectorSignals
      .map((s) => {
        const parts = [
          `${s.ticker}(${s.company_name}): 现价=${s.price ?? "N/A"}`,
          `1日涨跌=${s.change_pct_1d ?? "N/A"}%`,
          `5日涨跌=${s.change_pct_5d ?? "N/A"}%`,
          `相对成交量=${s.relative_volume ?? "N/A"}倍`,
        ];
        if (s.alert_flag) parts.push(`**程序预警: ${s.alert_reason}**`);
        return parts.join(", ");
      })
      .join("\n");

    const agg = computeSubsectorAggregate(code, subsectorSignals);
    const aggLine =
      agg.avgChangePct5d != null && agg.avgRelativeVolume != null
        ? `板块汇总(程序计算,非AI判断): 平均5日动量=${agg.avgChangePct5d}%, 平均相对成交量=${agg.avgRelativeVolume}倍 → 象限归类: ${MONEY_FLOW_QUADRANT_LABELS[agg.quadrant]}`
        : `板块汇总: 数据不足,无法归类象限`;

    return `【${TREND_SUBSECTOR_NAMES[code]}(${code})】\n${rows || "(无跟踪个股数据)"}\n${aggLine}`;
  }).join("\n\n");

  return `你是一名专注于"AI产业链美股"的资深行业研究分析师。今天是 ${reportDate}。

以下是AI产业6个细分行业(芯片/光模块/数据中心/存储/液冷/能源)的最新相关新闻,已过滤掉近期报告里出现过的旧新闻,每条前面 [编号] 是引用编号:

${newsBlock}

以下是程序按固定规则(单日涨跌幅超过5%,或成交量超过20日均量2.5倍)自动计算出的跟踪个股价格与成交量信号,"程序预警"是代码判断出来的客观结果,不是你的主观判断,你的任务是结合新闻解读"为什么"会出现这个信号:

${signalsBySubsector}

请针对全部6个细分行业分别给出趋势研判,通过 submit_trend_analysis 工具提交。硬性规则:

1. trend_direction 是你基于新闻+价格信号的综合判断:warming(升温)/ cooling(降温)/ stable(平稳)/ mixed(分化)。
2. summary_md 结合新闻和上面提供的具体数字(现价、涨跌幅、相对成交量)给出研判,不要只讲新闻不提数字,也不要凭空编造数字——所有数字必须来自上面提供的信号数据。**必须明确点评该板块"整体资金走势"**,直接引用上面"板块汇总"给出的象限归类结论(资金流入/资金流出/缩量上涨/低迷),并结合新闻解释可能的原因,不要只谈个股不谈板块整体。
3. alert_summary_md:只有当上面信号里出现"程序预警"标记的个股时才填写,结合新闻解读可能的原因(比如是否有相关新闻能解释这次异常波动);如果该行业没有任何预警标记,必须填 null,不要臆测不存在的预警。
4. 引用来源一律用 [编号] 或 source_news_ids 字段填数字编号,绝对不要自己转抄网址。
5. 所有文字用简体中文撰写,新闻标题如需引用需翻译成中文。
6. 如果某个细分行业新闻很少,如实说明"近期未发现该细分行业的新增新闻",仍需基于价格信号给出研判,不要编造新闻内容。`;
}

function resolveTrendCitations(raw: RawTrendReport, news: RawTrendNewsItem[]): ResolvedTrendReport {
  const urlByIndex = buildUrlIndex(news);

  const subsectors: ResolvedTrendSubsectorJudgment[] = raw.subsectors.map(
    (s: RawTrendSubsectorJudgment) => ({
      subsector_code: s.subsector_code,
      trend_direction: s.trend_direction,
      summary_md: resolveCitationsInText(s.summary_md, urlByIndex),
      alert_summary_md: s.alert_summary_md ? resolveCitationsInText(s.alert_summary_md, urlByIndex) : null,
      source_urls: resolveNewsIds(s.source_news_ids, urlByIndex),
    })
  );

  return { subsectors };
}

export async function synthesizeTrendAnalysis(
  news: RawTrendNewsItem[],
  signals: RawTrendSignal[],
  reportDate: string
): Promise<{ report: ResolvedTrendReport; usage: { input_tokens: number; output_tokens: number } }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 ANTHROPIC_API_KEY 环境变量");
  }

  const client = new Anthropic({ apiKey, timeout: 15 * 60 * 1000 });
  const prompt = buildPrompt(news, signals, reportDate);

  console.log(`[synthesizeTrend] 调用 ${MODEL} 生成趋势研判(新闻${news.length}条,个股${signals.length}支)...`);

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 24000,
    tools: [TREND_TOOL],
    tool_choice: { type: "tool", name: "submit_trend_analysis" },
    messages: [{ role: "user", content: prompt }],
  });
  const response = await stream.finalMessage();

  console.log(
    `[synthesizeTrend] stop_reason=${response.stop_reason} 输入token=${response.usage.input_tokens} 输出token=${response.usage.output_tokens}`
  );

  if (response.stop_reason === "max_tokens") {
    throw new Error("Claude 趋势研判输出在达到 max_tokens 上限时被截断,已放弃本次结果");
  }

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUseBlock) {
    throw new Error("Claude 未返回结构化 submit_trend_analysis 工具调用结果");
  }

  const rawReport = toolUseBlock.input as RawTrendReport;

  if (typeof rawReport.subsectors === "string") {
    try {
      rawReport.subsectors = JSON.parse(rawReport.subsectors);
      console.warn(`[synthesizeTrend] subsectors 是字符串编码的JSON,已自动解析为数组`);
    } catch {
      // 留给下面的类型检查统一报错
    }
  }

  if (!Array.isArray(rawReport.subsectors)) {
    console.error(`[synthesizeTrend] 原始返回内容(前2000字符): ${JSON.stringify(rawReport).slice(0, 2000)}`);
    throw new Error("Claude 返回的 subsectors 不是数组,结构不符合预期,已放弃本次结果");
  }

  const missing = TREND_SUBSECTOR_CODES.filter(
    (code: TrendSubsectorCode) => !rawReport.subsectors.some((s) => s.subsector_code === code)
  );
  if (missing.length > 0) {
    console.warn(`[synthesizeTrend] 警告: subsectors 缺少细分行业 ${missing.join(",")}`);
  }

  const report = resolveTrendCitations(rawReport, news);
  console.log(`[synthesizeTrend] 结构化分析解析成功: ${report.subsectors.length}个细分行业判断`);

  return {
    report,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

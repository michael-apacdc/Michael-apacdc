import Anthropic from "@anthropic-ai/sdk";
import type {
  RawFinancialData,
  RawNewsItem,
  SynthesizedReport,
} from "../lib/types";

// 用 Haiku 4.5 而非 Sonnet 5:定价 $1/$5 每百万输入/输出token(约为 Sonnet 5 的一半到三分之一),
// 对"抽取新闻+财务数据、按格式生成结构化报告"这类任务足够胜任,把每月成本压到几美元量级。
const MODEL = "claude-haiku-4-5-20251001";

const REPORT_TOOL = {
  name: "submit_report",
  description: "提交结构化的《全球数据中心行业趋势与投资分析日报》",
  input_schema: {
    type: "object" as const,
    properties: {
      news_summary_md: {
        type: "string",
        description: "重大新闻摘要板块,Markdown格式,中文,每条附来源链接",
      },
      apac_investment_md: {
        type: "string",
        description: "亚太地区数据中心投资动态板块,Markdown格式,中文,每条附来源链接",
      },
      geopolitics_md: {
        type: "string",
        description: "地缘政治相关报道板块,Markdown格式,中文,每条附来源链接",
      },
      trend_judgment_md: {
        type: "string",
        description: "行业趋势判断板块(需求/供给/电力散热/资本流向),Markdown格式,中文,每条判断附来源链接支撑",
      },
      competitive_md: {
        type: "string",
        description: "竞争态势分析板块(云厂商与数据中心运营商),Markdown格式,中文,附来源链接",
      },
      disclaimer_md: {
        type: "string",
        description: "免责声明,固定包含:此报告仅为基于公开新闻信息的研究分析,不构成正式投资建议,投资决策需自行判断风险,请独立核实信息准确性。",
      },
      stock_picks: {
        type: "array",
        description: "个股投资建议,覆盖提供的跟踪个股清单",
        items: {
          type: "object",
          properties: {
            ticker: { type: "string" },
            claude_rating: { type: "string", enum: ["bullish", "neutral", "bearish"] },
            position_size_pct: {
              type: ["number", "null"],
              description: "建议仓位比例(百分比数字,如2.5代表2.5%),无法给出时为null",
            },
            rationale_md: {
              type: "string",
              description: "分析理由,必须包含估值倍数对比、目标价参考、具体投资建议,且每条结论附来源链接或明确标注为AI推断",
            },
            source_urls: {
              type: "array",
              items: { type: "string" },
              description: "支撑该结论的信息来源链接列表",
            },
          },
          required: ["ticker", "claude_rating", "rationale_md", "source_urls"],
        },
      },
      trend_notes: {
        type: "array",
        description: "不挂靠单只股票的行业趋势判断",
        items: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: ["demand", "supply", "power_cooling", "capital_flows", "geopolitics"],
            },
            note_md: { type: "string" },
            source_urls: { type: "array", items: { type: "string" } },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["category", "note_md", "source_urls", "confidence"],
        },
      },
    },
    required: [
      "news_summary_md",
      "apac_investment_md",
      "geopolitics_md",
      "trend_judgment_md",
      "competitive_md",
      "disclaimer_md",
      "stock_picks",
      "trend_notes",
    ],
  },
};

function buildPrompt(news: RawNewsItem[], financials: RawFinancialData[], reportDate: string): string {
  const newsBlock = news
    .map(
      (n, i) =>
        `${i + 1}. [${n.region_tag}] ${n.headline}\n   来源: ${n.source_name} | 链接: ${n.url}\n   摘要: ${n.raw_snippet ?? "(无摘要)"}`
    )
    .join("\n\n");

  const financialsBlock = financials
    .map((f) => {
      const parts = [
        `${f.ticker}: 现价=${f.current_price ?? "N/A"} ${f.currency}`,
        `PE=${f.pe_ratio ?? "N/A"}`,
        `EV/EBITDA=${f.ev_ebitda ?? "N/A"}`,
        `目标价(低/均/高)=${f.target_price_low ?? "N/A"}/${f.target_price_avg ?? "N/A"}/${f.target_price_high ?? "N/A"}`,
      ];
      if (f.data_source_note) parts.push(`备注: ${f.data_source_note}`);
      return parts.join(", ");
    })
    .join("\n");

  return `你是一名专注于"全球数据中心与AI基础设施产业"的资深行业研究分析师。今天是 ${reportDate}。

以下是过去24小时抓取到的新闻(已去重,按地区/主题打了初步标签):

${newsBlock}

以下是跟踪个股的最新金融数据(来自 Financial Modeling Prep 免费版API):

${financialsBlock}

请基于以上真实数据生成完整的日报,通过 submit_report 工具提交。硬性要求:
1. 所有正文板块必须用简体中文撰写,Markdown格式,可以保留英文新闻标题原文。
2. 每一条新闻摘要、趋势判断、竞争态势分析、个股建议,都必须在正文中以 Markdown 链接形式引用具体来源(用上面提供的链接),不能凭空给出无来源支撑的结论。如果某个判断完全是你自己的推断而非基于以上新闻/数据,必须明确标注"(AI推断,无直接信源)"。
3. 个股建议必须结合上面提供的量化数据(现价、PE、EV/EBITDA、目标价)给出具体的估值倍数对比和目标价参考;如果某个数据字段为 N/A,要在建议中说明"该数据当前无法获取"而不是编造数字。
4. stock_picks 需要覆盖上面列出的所有跟踪个股。
5. 亚太地区投资动态和地缘政治板块要重点突出,不要写成泛泛而谈的套话,要引用具体新闻事件。
6. 如果抓到的新闻数量很少或缺失某个地区的新闻,如实在对应板块说明"今日未抓取到该地区的相关新闻",不要编造。`;
}

export async function synthesizeReport(
  news: RawNewsItem[],
  financials: RawFinancialData[],
  reportDate: string
): Promise<{ report: SynthesizedReport; usage: { input_tokens: number; output_tokens: number } }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 ANTHROPIC_API_KEY 环境变量");
  }

  // 10分钟超时:大上下文+较大max_tokens的请求可能耗时较长,
  // 用流式(stream)调用而非一次性等待,避免非流式请求的连接超时限制。
  const client = new Anthropic({ apiKey, timeout: 15 * 60 * 1000 });
  const prompt = buildPrompt(news, financials, reportDate);

  console.log(
    `[synthesize] 调用 ${MODEL} 生成报告(新闻${news.length}条,个股${financials.length}支)...`
  );

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    tools: [REPORT_TOOL],
    tool_choice: { type: "tool", name: "submit_report" },
    messages: [{ role: "user", content: prompt }],
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "Claude 输出在达到 max_tokens 上限时被截断,结构化JSON很可能不完整,已放弃本次结果(可以调高 synthesize.ts 里的 max_tokens 后重试)"
    );
  }

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUseBlock) {
    throw new Error("Claude 未返回结构化 submit_report 工具调用结果");
  }

  const report = toolUseBlock.input as SynthesizedReport;
  console.log(
    `[synthesize] 完成,输入token=${response.usage.input_tokens} 输出token=${response.usage.output_tokens}`
  );

  return {
    report,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

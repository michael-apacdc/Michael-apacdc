import Anthropic from "@anthropic-ai/sdk";
import type {
  RawNewsItem,
  RawSynthesizedReport,
  SynthesizedReport,
  SynthesizedTrendNote,
} from "../lib/types";
import { buildUrlIndex, resolveCitationsInText, resolveNewsIds } from "./citations";

// 用 Haiku 4.5 而非 Sonnet 5:定价 $1/$5 每百万输入/输出token(约为 Sonnet 5 的一半到三分之一),
// 对"抽取新闻、按格式生成结构化报告"这类任务足够胜任,把每月成本压到几美元量级。
const MODEL = "claude-haiku-4-5-20251001";

const REPORT_TOOL = {
  name: "submit_report",
  description: "提交结构化的《全球数据中心行业趋势与投资分析日报》",
  input_schema: {
    type: "object" as const,
    properties: {
      news_summary_md: {
        type: "string",
        description: "重大新闻摘要板块,Markdown格式,中文,每条用 [编号] 引用来源",
      },
      apac_investment_md: {
        type: "string",
        description: "亚太地区数据中心投资动态板块,Markdown格式,中文,每条用 [编号] 引用来源",
      },
      geopolitics_md: {
        type: "string",
        description: "地缘政治相关报道板块,Markdown格式,中文,每条用 [编号] 引用来源",
      },
      trend_judgment_md: {
        type: "string",
        description: "行业趋势判断板块(需求/供给/电力散热/资本流向),Markdown格式,中文,每条判断用 [编号] 引用来源支撑",
      },
      competitive_md: {
        type: "string",
        description: "竞争态势分析板块(云厂商与数据中心运营商),Markdown格式,中文,用 [编号] 引用来源",
      },
      disclaimer_md: {
        type: "string",
        description: "免责声明,固定包含:此报告仅为基于公开新闻信息的研究分析,不构成正式投资建议,投资决策需自行判断风险,请独立核实信息准确性。",
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
            source_news_ids: {
              type: "array",
              items: { type: "integer" },
              description: "支撑该判断的新闻编号列表(引用上面新闻列表里的序号,不是网址)",
            },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["category", "note_md", "source_news_ids", "confidence"],
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
      "trend_notes",
    ],
  },
};

function buildPrompt(news: RawNewsItem[], reportDate: string): string {
  const newsBlock = news
    .map(
      (n, i) =>
        `[${i + 1}] [${n.region_tag}] ${n.headline}\n   来源: ${n.source_name}\n   摘要: ${n.raw_snippet ?? "(无摘要)"}`
    )
    .join("\n\n");

  return `你是一名专注于"全球数据中心与AI基础设施产业"的资深行业研究分析师。今天是 ${reportDate}。

以下是最新抓取到的新闻,已经过滤掉近期报告里出现过的旧新闻,全部是新增内容,每条前面的 [编号] 是这条新闻的引用编号(按地区/主题打了初步标签):

${newsBlock}

请基于以上真实数据生成完整的日报,通过 submit_report 工具提交。硬性要求:

【关于引用来源 —— 这是最重要的规则,必须严格遵守】
- 引用新闻来源时,只能在正文里写 [编号] 这种形式,例如 "字节跳动宣布扩建东南亚数据中心 [12]"。编号必须对应上面新闻列表里该条新闻前面的 [编号]。
- 如果一句话需要同时引用多条新闻,把编号写在**同一个方括号里、用逗号分隔**,例如 [12,45,103];绝对不要写成 [12][45] 这种连续相邻的方括号,那样在网页上会看起来像一串乱码数字。
- trend_notes 里的 source_news_ids 字段也只填数字编号(如 [12, 45]),不要填网址。
- 绝对不要在任何地方自己输出网址或写 Markdown 链接格式 [文字](网址) —— 网址由系统程序在你之后自动查表替换,你不需要也不应该知道或转抄真实网址,你转抄的网址几乎必然是错的、打不开的。
- 如果某个判断完全是你自己的推断而非基于以上新闻/数据,不要编号,直接标注"(AI推断,无直接信源)"。

其他要求:
1. 所有正文板块必须用简体中文撰写,Markdown格式。**新闻标题必须翻译成中文**,不要保留英文原文(如果需要保留关键专有名词可以用括号在中文标题后面附上,例如"字节跳动在泰国建设数据中心(ByteDance Thailand Data Center)",但不能整条标题都是英文)。
2. 亚太地区投资动态和地缘政治板块要重点突出,不要写成泛泛而谈的套话,要引用具体新闻事件编号。
3. 如果新增新闻数量很少或缺失某个地区的新闻(可能是因为近期该地区新闻已在往日报告中报道过、今天没有新增内容),如实在对应板块说明"近期未发现该地区的新增新闻",不要编造,也不要把往日报道过的旧内容当成新内容重新讲一遍。
4. 排版格式(重要,必须严格按下面的两层列表结构,不要把多条新闻用分号或逗号挤在同一行):
   news_summary_md、apac_investment_md、geopolitics_md、competitive_md 这几个板块必须写成**两层 Markdown 列表**:
   - 第一层:分类小标题,格式为 "- **分类名称**"(这一行只有分类名称,后面不要跟任何新闻内容)
   - 第二层:该分类下每一条具体新闻各自单独一行,用2个空格缩进的 "  - " 开头,每行只写一条新闻(已翻译成中文的标题/要点 + [编号]),不要把多条新闻写在同一行、也不要用分号连接。
   示例(严格照这个结构):
   \`\`\`
   - **AI基础设施投资热潮持续**
     - Wall Street预期美国AI基础设施支出2027年破万亿美元 [13,15]
     - JPMorgan称5.5万亿美元AI资本开支目前仍然盈利 [2]
   - **供应链与融资动向**
     - 私募市场在数据中心融资中角色日益重要 [3]
     - TeraWulf与Anthropic签署190亿美元数据中心租赁协议 [27]
   \`\`\`
   trend_judgment_md 按"需求端/供给端/电力散热/资本流向"这几个维度,同样用一层列表分行列出,每个维度一行。

篇幅限制(重要,严格遵守,避免输出超长被截断):
- news_summary_md、apac_investment_md、geopolitics_md、competitive_md:每个板块控制在300字以内。
- trend_judgment_md:控制在400字以内。
- 每条 trend_notes 的 note_md:控制在100字以内。
- 宁可简洁精炼,也不要因为追求详尽而导致输出被截断。`;
}

function resolveCitations(raw: RawSynthesizedReport, news: RawNewsItem[]): SynthesizedReport {
  const urlByIndex = buildUrlIndex(news);

  const trend_notes: SynthesizedTrendNote[] = raw.trend_notes.map((note) => ({
    category: note.category,
    note_md: resolveCitationsInText(note.note_md, urlByIndex),
    source_urls: resolveNewsIds(note.source_news_ids, urlByIndex),
    confidence: note.confidence,
  }));

  return {
    news_summary_md: resolveCitationsInText(raw.news_summary_md, urlByIndex),
    apac_investment_md: resolveCitationsInText(raw.apac_investment_md, urlByIndex),
    geopolitics_md: resolveCitationsInText(raw.geopolitics_md, urlByIndex),
    trend_judgment_md: resolveCitationsInText(raw.trend_judgment_md, urlByIndex),
    competitive_md: resolveCitationsInText(raw.competitive_md, urlByIndex),
    disclaimer_md: raw.disclaimer_md,
    trend_notes,
  };
}

export async function synthesizeReport(
  news: RawNewsItem[],
  reportDate: string
): Promise<{ report: SynthesizedReport; usage: { input_tokens: number; output_tokens: number } }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 ANTHROPIC_API_KEY 环境变量");
  }

  // 10分钟超时:大上下文+较大max_tokens的请求可能耗时较长,
  // 用流式(stream)调用而非一次性等待,避免非流式请求的连接超时限制。
  const client = new Anthropic({ apiKey, timeout: 15 * 60 * 1000 });
  const prompt = buildPrompt(news, reportDate);

  console.log(`[synthesize] 调用 ${MODEL} 生成报告(新闻${news.length}条)...`);

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    tools: [REPORT_TOOL],
    tool_choice: { type: "tool", name: "submit_report" },
    messages: [{ role: "user", content: prompt }],
  });
  const response = await stream.finalMessage();

  console.log(
    `[synthesize] stop_reason=${response.stop_reason} 输入token=${response.usage.input_tokens} 输出token=${response.usage.output_tokens}`
  );

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

  const rawReport = toolUseBlock.input as RawSynthesizedReport;

  // Haiku 偶尔会把数组字段编码成JSON字符串而不是真正的嵌套数组,这里做兼容解析
  if (typeof rawReport.trend_notes === "string") {
    try {
      rawReport.trend_notes = JSON.parse(rawReport.trend_notes);
      console.warn(`[synthesize] trend_notes 是字符串编码的JSON,已自动解析为数组`);
    } catch {
      // 解析失败,留给下面的类型检查统一报错
    }
  }

  console.log(
    `[synthesize] trend_notes类型=${Array.isArray(rawReport.trend_notes) ? `array(${rawReport.trend_notes.length})` : typeof rawReport.trend_notes}`
  );
  if (!Array.isArray(rawReport.trend_notes)) {
    console.error(`[synthesize] 原始返回内容(前2000字符): ${JSON.stringify(rawReport).slice(0, 2000)}`);
    throw new Error("Claude 返回的 trend_notes 不是数组,结构不符合预期,已放弃本次结果");
  }
  const report = resolveCitations(rawReport, news);
  console.log(`[synthesize] 结构化报告解析成功,引用编号已替换为真实链接`);

  return {
    report,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

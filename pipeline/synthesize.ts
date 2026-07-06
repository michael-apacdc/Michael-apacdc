import Anthropic from "@anthropic-ai/sdk";
import type {
  RawFinancialData,
  RawNewsItem,
  RawSynthesizedReport,
  SynthesizedReport,
  SynthesizedStockPick,
  SynthesizedTrendNote,
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
              description: "分析理由,必须包含估值倍数对比、目标价参考、具体投资建议,正文中用 [编号] 引用来源,没有信源支撑的判断要明确标注为AI推断",
            },
            source_news_ids: {
              type: "array",
              items: { type: "integer" },
              description: "支撑该结论的新闻编号列表(引用上面新闻列表里的序号,不是网址)",
            },
          },
          required: ["ticker", "claude_rating", "rationale_md", "source_news_ids"],
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
      "stock_picks",
      "trend_notes",
    ],
  },
};

function buildPrompt(news: RawNewsItem[], financials: RawFinancialData[], reportDate: string): string {
  const newsBlock = news
    .map(
      (n, i) =>
        `[${i + 1}] [${n.region_tag}] ${n.headline}\n   来源: ${n.source_name}\n   摘要: ${n.raw_snippet ?? "(无摘要)"}`
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

以下是过去24小时抓取到的新闻,每条前面的 [编号] 是这条新闻的引用编号(已去重,按地区/主题打了初步标签):

${newsBlock}

以下是跟踪个股的最新金融数据(来自 Financial Modeling Prep 免费版API):

${financialsBlock}

请基于以上真实数据生成完整的日报,通过 submit_report 工具提交。硬性要求:

【关于引用来源 —— 这是最重要的规则,必须严格遵守】
- 引用新闻来源时,只能在正文里写 [编号] 这种形式,例如 "字节跳动宣布扩建东南亚数据中心 [12]"。编号必须对应上面新闻列表里该条新闻前面的 [编号]。
- 如果一句话需要同时引用多条新闻,把编号写在**同一个方括号里、用逗号分隔**,例如 [12,45,103];绝对不要写成 [12][45] 这种连续相邻的方括号,那样在网页上会看起来像一串乱码数字。
- stock_picks 和 trend_notes 里的 source_news_ids 字段也只填数字编号(如 [12, 45]),不要填网址。
- 绝对不要在任何地方自己输出网址或写 Markdown 链接格式 [文字](网址) —— 网址由系统程序在你之后自动查表替换,你不需要也不应该知道或转抄真实网址,你转抄的网址几乎必然是错的、打不开的。
- 如果某个判断完全是你自己的推断而非基于以上新闻/数据,不要编号,直接标注"(AI推断,无直接信源)"。

其他要求:
1. 所有正文板块必须用简体中文撰写,Markdown格式,可以保留英文新闻标题原文。
2. 个股建议必须结合上面提供的量化数据(现价、PE、EV/EBITDA、目标价)给出具体的估值倍数对比和目标价参考;如果某个数据字段为 N/A,要在建议中说明"该数据当前无法获取"而不是编造数字。
3. stock_picks 需要覆盖上面列出的所有跟踪个股。
4. 亚太地区投资动态和地缘政治板块要重点突出,不要写成泛泛而谈的套话,要引用具体新闻事件编号。
5. 如果抓到的新闻数量很少或缺失某个地区的新闻,如实在对应板块说明"今日未抓取到该地区的相关新闻",不要编造。
6. 排版格式(重要):news_summary_md、apac_investment_md、geopolitics_md、competitive_md 这几个板块必须用 Markdown 无序列表(每行以 "- " 开头)组织内容,每一条独立的新闻/事实各占一行,不要把多条不同的新闻揉进同一段连续文字里。可以在列表项前用"**分类词**:"这样的加粗小标题分组,但每条具体事实仍必须独立成行。trend_judgment_md 也按"需求端/供给端/电力散热/资本流向"几个维度分行列出。

篇幅限制(重要,严格遵守,避免输出超长被截断):
- news_summary_md、apac_investment_md、geopolitics_md、competitive_md:每个板块控制在300字以内。
- trend_judgment_md:控制在400字以内。
- 每支个股的 rationale_md:控制在120字以内,只写最核心的估值对比和结论,不要展开背景介绍。
- 每条 trend_notes 的 note_md:控制在100字以内。
- 宁可简洁精炼,也不要因为追求详尽而导致输出被截断。`;
}

// 把正文里的 [12] 或 [12,45,103] 这种引用编号替换成放大镜图标链接(每个编号一个链接),
// 而不是直接显示数字 —— 数字挨在一起在网页上会连成一串看不清的乱码。
// 编号无效(超出范围)时原样保留文字,不当成链接处理。
const CITATION_ICON = "🔍";
const CITATION_GAP = " "; // 窄空格,让相邻的引用图标之间留一点缝隙

function resolveCitationsInText(text: string, urlByIndex: Map<number, string>): string {
  return text.replace(/\[(\d{1,4}(?:\s*,\s*\d{1,4})*)\](?!\()/g, (match, idsStr: string) => {
    const links = idsStr
      .split(",")
      .map((s) => urlByIndex.get(Number(s.trim())))
      .filter((url): url is string => Boolean(url))
      .map((url) => `[${CITATION_ICON}](${url})`);
    return links.length > 0 ? links.join(CITATION_GAP) : match;
  });
}

function resolveNewsIds(ids: number[] | undefined, urlByIndex: Map<number, string>): string[] {
  if (!ids) return [];
  const urls: string[] = [];
  for (const id of ids) {
    const url = urlByIndex.get(id);
    if (url) urls.push(url);
  }
  return urls;
}

function resolveCitations(raw: RawSynthesizedReport, news: RawNewsItem[]): SynthesizedReport {
  const urlByIndex = new Map<number, string>(news.map((n, i) => [i + 1, n.url]));

  const stock_picks: SynthesizedStockPick[] = raw.stock_picks.map((pick) => ({
    ticker: pick.ticker,
    claude_rating: pick.claude_rating,
    position_size_pct: pick.position_size_pct,
    rationale_md: resolveCitationsInText(pick.rationale_md, urlByIndex),
    source_urls: resolveNewsIds(pick.source_news_ids, urlByIndex),
  }));

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
    stock_picks,
    trend_notes,
  };
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
    max_tokens: 48000,
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
  for (const key of ["stock_picks", "trend_notes"] as const) {
    const value = rawReport[key];
    if (typeof value === "string") {
      try {
        rawReport[key] = JSON.parse(value);
        console.warn(`[synthesize] ${key} 是字符串编码的JSON,已自动解析为数组`);
      } catch {
        // 解析失败,留给下面的类型检查统一报错
      }
    }
  }

  console.log(
    `[synthesize] stock_picks类型=${Array.isArray(rawReport.stock_picks) ? `array(${rawReport.stock_picks.length})` : typeof rawReport.stock_picks} trend_notes类型=${Array.isArray(rawReport.trend_notes) ? `array(${rawReport.trend_notes.length})` : typeof rawReport.trend_notes}`
  );
  if (!Array.isArray(rawReport.stock_picks) || !Array.isArray(rawReport.trend_notes)) {
    console.error(`[synthesize] 原始返回内容(前2000字符): ${JSON.stringify(rawReport).slice(0, 2000)}`);
    throw new Error("Claude 返回的 stock_picks 或 trend_notes 不是数组,结构不符合预期,已放弃本次结果");
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

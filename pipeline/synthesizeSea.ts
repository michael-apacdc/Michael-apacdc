import Anthropic from "@anthropic-ai/sdk";
import type {
  FitVerdict,
  RawSeaCountryOutlook,
  RawSeaDealScore,
  RawSeaReport,
  ResolvedSeaCountryOutlook,
  ResolvedSeaDeal,
  ResolvedSeaReport,
  SeaCountryCode,
} from "../lib/types";
import type { RawSeaNewsItem } from "./fetchSeaNews";
import { buildUrlIndex, resolveCitationsInText, resolveNewsIds } from "./citations";

const MODEL = "claude-haiku-4-5-20251001";

// 六维度框架的固定权重(取用户给定区间的中点,合计100%)。
// 加权总分由程序计算,不让模型自己做数学,减少算错的风险。
const DIMENSION_WEIGHTS = {
  power: 0.38,
  connectivity: 0.22,
  land_civil: 0.15,
  policy: 0.12,
  climate_cooling: 0.08,
  risk: 0.05,
} as const;

const COUNTRY_NAMES: Record<SeaCountryCode, string> = {
  SG: "新加坡",
  MY: "马来西亚",
  TH: "泰国",
  ID: "印度尼西亚",
  JP: "日本",
  AU: "澳大利亚",
  KR: "韩国",
};

const COUNTRY_CODES = Object.keys(COUNTRY_NAMES) as SeaCountryCode[];

const SEA_ANALYSIS_TOOL = {
  name: "submit_sea_analysis",
  description: "提交亚太数据中心选址分析(逐条土地/电力交易评分 + 七国投资热度排名)",
  input_schema: {
    type: "object" as const,
    properties: {
      deals: {
        type: "array",
        description: "新闻里发现的每一条具体的数据中心拿地/签电力协议事件",
        items: {
          type: "object",
          properties: {
            country_code: { type: "string", enum: ["SG", "MY", "TH", "ID", "JP", "AU", "KR"] },
            company: { type: "string", description: "涉事的数据中心/云厂商/开发商公司名" },
            headline: { type: "string", description: "中文翻译后的新闻标题" },
            deal_summary_md: { type: "string", description: "这条交易的简要说明(80字以内),用[编号]引用来源" },
            land_location: {
              type: ["string", "null"],
              description: "新闻披露的具体地块/地区/工业园区名称,未披露则为null",
            },
            power_score: {
              type: ["integer", "null"],
              description: "电力与能源维度评分1-5分(5分=变电站距离近/容量足/有绿电长期配额/可带电买地;1分=电网排队严重或电价前景差)。新闻未披露相关信息时填null",
            },
            power_notes_md: { type: "string", description: "打分依据,若为null要说明'新闻未披露相关信息'" },
            connectivity_score: {
              type: ["integer", "null"],
              description: "网络与连接维度评分1-5分(骨干光纤邻近度、多运营商中立性、到IXP延迟)。未披露则null",
            },
            connectivity_notes_md: { type: "string" },
            land_civil_score: {
              type: ["integer", "null"],
              description: "土地与工程维度评分1-5分(地块面积100-500英亩以上、地形地质、扩建潜力、是否棕地改造)。未披露则null",
            },
            land_civil_notes_md: { type: "string" },
            policy_score: {
              type: ["integer", "null"],
              description: "税收与政策维度评分1-5分(销售税/财产税豁免、审批速度、数据主权法规确定性)。未披露则null",
            },
            policy_notes_md: { type: "string" },
            climate_cooling_score: {
              type: ["integer", "null"],
              description: "气候与水资源维度评分1-5分(湿球温度、免费冷却天数、水资源/废热回收)。未披露则null",
            },
            climate_cooling_notes_md: { type: "string" },
            risk_score: {
              type: ["integer", "null"],
              description: "自然与人为风险维度评分1-5分(洪水位、地震带、邻近铁路/化工厂等风险,5分=风险很低)。未披露则null",
            },
            risk_notes_md: { type: "string" },
            source_news_ids: {
              type: "array",
              items: { type: "integer" },
              description: "支撑这条交易描述的新闻编号列表",
            },
          },
          required: [
            "country_code",
            "company",
            "headline",
            "deal_summary_md",
            "land_location",
            "power_score",
            "power_notes_md",
            "connectivity_score",
            "connectivity_notes_md",
            "land_civil_score",
            "land_civil_notes_md",
            "policy_score",
            "policy_notes_md",
            "climate_cooling_score",
            "climate_cooling_notes_md",
            "risk_score",
            "risk_notes_md",
            "source_news_ids",
          ],
        },
      },
      country_outlook: {
        type: "array",
        description: "对全部7个跟踪国家的宏观投资热度判断,必须覆盖SG/MY/TH/ID/JP/AU/KR这7个,即使当天没有具体交易新闻也要给出产业环境层面的判断",
        items: {
          type: "object",
          properties: {
            country_code: { type: "string", enum: ["SG", "MY", "TH", "ID", "JP", "AU", "KR"] },
            attractiveness_score: {
              type: "number",
              description: "0-100的综合投资吸引力评分,越高代表当前越值得作为下一步数据中心投资重点",
            },
            rank_position: { type: "integer", description: "1-7的排名,1代表最值得关注" },
            outlook_md: {
              type: "string",
              description: "150字以内的判断理由,用[编号]引用具体新闻;如果当天没有该国的具体交易新闻,要明确说明'今日未发现具体拿地/电力新闻,以下为产业环境层面的持续观察意见'",
            },
            source_news_ids: { type: "array", items: { type: "integer" } },
          },
          required: ["country_code", "attractiveness_score", "rank_position", "outlook_md", "source_news_ids"],
        },
      },
    },
    required: ["deals", "country_outlook"],
  },
};

function buildPrompt(news: RawSeaNewsItem[], reportDate: string): string {
  const newsBlock = news
    .map(
      (n, i) =>
        `[${i + 1}] [${n.sea_country}] ${n.headline}\n   来源: ${n.source_name}\n   摘要: ${n.raw_snippet ?? "(无摘要)"}`
    )
    .join("\n\n");

  return `你是一名专注于"亚太数据中心选址与土地/电力投资"的资深产业分析师。今天是 ${reportDate}。

以下是针对新加坡(SG)、马来西亚(MY)、泰国(TH)、印度尼西亚(ID)、日本(JP)、澳大利亚(AU)、韩国(KR)抓取到的数据中心"拿地"和"签电力协议"相关新闻,已过滤掉近期报告里出现过的旧新闻、全部是新增内容,每条前面 [编号] 是引用编号:

${newsBlock}

请用下面这套选址评估框架,分析新闻里出现的每一条具体交易,并给出七国的宏观投资热度排名。通过 submit_sea_analysis 工具提交。

【选址评估六维度框架(仅供参考评分标准,不要在输出里逐字复述这段说明)】
1. 能源与电力(权重38%,最重要):变电站距离与可用容量(MW)、双路供电与网架可靠性、电价走势与PPA谈判空间、绿电(风光核地热)供应充足度、是否"带电买地"绕开电网排队。
2. 网络与连接(权重22%):骨干光纤邻近度、多运营商中立性、暗光纤可租用量、到IXP延迟(AI推断训练可远离城市、云推断需低于10ms)。
3. 土地与工程(权重15%):地块面积(通常100-500英亩以上)、地形地质、扩建潜力、是否棕地改造复用既有电力容量。
4. 税收与政策(权重12%):销售税/财产税豁免、审批速度与营商环境、数据主权法规环境。
5. 气候与水资源(权重8%):全年湿球温度、免费冷却天数、工业用水/再生水供应、废热回收可行性。
6. 自然与人为风险(权重5%):洪水位、地震带/龙卷风走廊、邻近铁路/化工厂/航道等风险。

【硬性规则】
1. deals 数组:新闻里每一条具体的"公司+拿地/签电力协议"事件各占一条。如果同一条新闻同时提到多个维度信息就都填,新闻没提到的维度必须把对应 score 字段设为 null 并在 notes 里写"新闻未披露相关信息",绝对不能编造具体数字(比如虚构MW容量、英亩数、湿球温度)。
2. country_outlook 数组:必须覆盖全部7个国家,即使某国今天没有具体交易新闻,也要基于该国近期整体产业环境(电价政策、政府数据中心产业规划、电网建设等)给出一个持续观察层面的判断,并如实说明"今日未发现具体拿地/电力新闻"。
3. 引用来源一律用 [编号] 或 source_news_ids 字段填数字编号,绝对不要自己转抄网址。
4. 所有文字用简体中文撰写,新闻标题需翻译成中文。
5. 宁可保守打分、多用null,也不要为了看起来完整而编造数据。`;
}

function computeOverallScore(deal: RawSeaDealScore): { overall_score: number; fit_verdict: FitVerdict } {
  const scored: [number, number][] = []; // [weight, score]
  const add = (weight: number, score: number | null) => {
    if (score != null) scored.push([weight, score]);
  };
  add(DIMENSION_WEIGHTS.power, deal.power_score);
  add(DIMENSION_WEIGHTS.connectivity, deal.connectivity_score);
  add(DIMENSION_WEIGHTS.land_civil, deal.land_civil_score);
  add(DIMENSION_WEIGHTS.policy, deal.policy_score);
  add(DIMENSION_WEIGHTS.climate_cooling, deal.climate_cooling_score);
  add(DIMENSION_WEIGHTS.risk, deal.risk_score);

  if (scored.length < 2) {
    return { overall_score: 0, fit_verdict: "insufficient_data" };
  }

  const totalWeight = scored.reduce((sum, [w]) => sum + w, 0);
  const weightedAvgScore = scored.reduce((sum, [w, s]) => sum + w * s, 0) / totalWeight; // 1-5 scale
  const overall_score = Number(((weightedAvgScore / 5) * 100).toFixed(1));

  let fit_verdict: FitVerdict;
  if (overall_score >= 75) fit_verdict = "strong_fit";
  else if (overall_score >= 50) fit_verdict = "partial_fit";
  else fit_verdict = "weak_fit";

  return { overall_score, fit_verdict };
}

function resolveSeaCitations(raw: RawSeaReport, news: RawSeaNewsItem[]): ResolvedSeaReport {
  const urlByIndex = buildUrlIndex(news);

  const deals: ResolvedSeaDeal[] = raw.deals.map((deal) => {
    const { overall_score, fit_verdict } = computeOverallScore(deal);
    return {
      country_code: deal.country_code,
      company: deal.company,
      headline: deal.headline,
      deal_summary_md: resolveCitationsInText(deal.deal_summary_md, urlByIndex),
      land_location: deal.land_location,
      power_score: deal.power_score,
      power_notes_md: deal.power_notes_md,
      connectivity_score: deal.connectivity_score,
      connectivity_notes_md: deal.connectivity_notes_md,
      land_civil_score: deal.land_civil_score,
      land_civil_notes_md: deal.land_civil_notes_md,
      policy_score: deal.policy_score,
      policy_notes_md: deal.policy_notes_md,
      climate_cooling_score: deal.climate_cooling_score,
      climate_cooling_notes_md: deal.climate_cooling_notes_md,
      risk_score: deal.risk_score,
      risk_notes_md: deal.risk_notes_md,
      overall_score,
      fit_verdict,
      source_urls: resolveNewsIds(deal.source_news_ids, urlByIndex),
    };
  });

  const country_outlook: ResolvedSeaCountryOutlook[] = raw.country_outlook.map(
    (outlook: RawSeaCountryOutlook) => ({
      country_code: outlook.country_code,
      attractiveness_score: outlook.attractiveness_score,
      rank_position: outlook.rank_position,
      outlook_md: resolveCitationsInText(outlook.outlook_md, urlByIndex),
      source_urls: resolveNewsIds(outlook.source_news_ids, urlByIndex),
    })
  );

  return { deals, country_outlook };
}

export async function synthesizeSeaAnalysis(
  news: RawSeaNewsItem[],
  reportDate: string
): Promise<{ report: ResolvedSeaReport; usage: { input_tokens: number; output_tokens: number } }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 ANTHROPIC_API_KEY 环境变量");
  }

  const client = new Anthropic({ apiKey, timeout: 15 * 60 * 1000 });
  const prompt = buildPrompt(news, reportDate);

  console.log(`[synthesizeSea] 调用 ${MODEL} 生成选址分析(新闻${news.length}条)...`);

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    tools: [SEA_ANALYSIS_TOOL],
    tool_choice: { type: "tool", name: "submit_sea_analysis" },
    messages: [{ role: "user", content: prompt }],
  });
  const response = await stream.finalMessage();

  console.log(
    `[synthesizeSea] stop_reason=${response.stop_reason} 输入token=${response.usage.input_tokens} 输出token=${response.usage.output_tokens}`
  );

  if (response.stop_reason === "max_tokens") {
    throw new Error("Claude 选址分析输出在达到 max_tokens 上限时被截断,已放弃本次结果");
  }

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUseBlock) {
    throw new Error("Claude 未返回结构化 submit_sea_analysis 工具调用结果");
  }

  const rawReport = toolUseBlock.input as RawSeaReport;

  for (const key of ["deals", "country_outlook"] as const) {
    const value = rawReport[key];
    if (typeof value === "string") {
      try {
        rawReport[key] = JSON.parse(value);
        console.warn(`[synthesizeSea] ${key} 是字符串编码的JSON,已自动解析为数组`);
      } catch {
        // 留给下面的类型检查统一报错
      }
    }
  }

  console.log(
    `[synthesizeSea] deals类型=${Array.isArray(rawReport.deals) ? `array(${rawReport.deals.length})` : typeof rawReport.deals} country_outlook类型=${Array.isArray(rawReport.country_outlook) ? `array(${rawReport.country_outlook.length})` : typeof rawReport.country_outlook}`
  );
  if (!Array.isArray(rawReport.deals) || !Array.isArray(rawReport.country_outlook)) {
    console.error(`[synthesizeSea] 原始返回内容(前6000字符): ${JSON.stringify(rawReport).slice(0, 6000)}`);
    throw new Error("Claude 返回的 deals 或 country_outlook 不是数组,结构不符合预期,已放弃本次结果");
  }

  const missing = COUNTRY_CODES.filter(
    (code) => !rawReport.country_outlook.some((o) => o.country_code === code)
  );
  if (missing.length > 0) {
    console.warn(`[synthesizeSea] 警告: country_outlook 缺少国家 ${missing.join(",")}`);
  }

  const report = resolveSeaCitations(rawReport, news);
  console.log(`[synthesizeSea] 结构化分析解析成功: ${report.deals.length}条交易, ${report.country_outlook.length}个国家判断`);

  return {
    report,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

import Anthropic from "@anthropic-ai/sdk";
import type { FactorWeights, DailyScore } from "../lib/aiQuant";
import { AI_UNIVERSE, AI_SUBSECTOR_NAMES } from "../lib/aiUniverse";

// 点评用 Sonnet:$3/百万输入token,$15/百万输出token。
const MODEL = "claude-sonnet-5";
export const AIQUANT_PRICE_PER_MTOK_INPUT = 3;
export const AIQUANT_PRICE_PER_MTOK_OUTPUT = 15;

const TOOL = {
  name: "submit_aiquant_commentary",
  description: "提交对当日AI板块相对强弱排名的解读点评",
  input_schema: {
    type: "object" as const,
    properties: {
      commentary_md: {
        type: "string",
        description:
          "对当日排名的解读(350字以内):最强/最弱的子板块和个股、和近期排名相比的明显变化、实盘追踪成绩说明了什么。只解读给出的数据,禁止编造数字,禁止给出确定性的涨跌预测。",
      },
    },
    required: ["commentary_md"],
  },
};

export interface LiveTrackStats {
  resolvedPicks: number;
  resolvedHits: number;
  avgExcessPct: number | null;
  dayWindows: number;
  dayWins: number;
}

function fmt(n: number | null | undefined, digits = 1): string {
  return n == null ? "N/A" : n.toFixed(digits);
}

function buildPrompt(
  reportDate: string,
  scores: DailyScore[],
  picks: DailyScore[],
  weights: FactorWeights,
  live: LiveTrackStats
): string {
  const nameByTicker = new Map(AI_UNIVERSE.map((s) => [s.ticker, s]));
  const ranked = scores
    .filter((s) => s.rank != null)
    .sort((a, b) => (a.rank as number) - (b.rank as number));

  const rankLines = ranked
    .map((s) => {
      const info = nameByTicker.get(s.ticker);
      return `#${s.rank} ${s.ticker}(${info?.companyName ?? ""}/${info ? AI_SUBSECTOR_NAMES[info.subsector] : ""}) 得分=${fmt(s.score, 2)}`;
    })
    .join("\n");

  const pickLine = picks.map((p) => p.ticker).join(", ");
  const weightLine = Object.entries(weights)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${k}=${(v as number).toFixed(2)}`)
    .join(", ");

  const liveLine =
    live.resolvedPicks > 0
      ? `已回填结果的信号 ${live.resolvedPicks} 条,跑赢板块 ${live.resolvedHits} 条(成功率${((live.resolvedHits / live.resolvedPicks) * 100).toFixed(1)}%),平均超额收益 ${fmt(live.avgExcessPct, 2)}%;按信号日聚合 ${live.dayWins}/${live.dayWindows} 天的前5名单平均跑赢板块`
      : "观察模式刚启动,还没有可回填结果的信号";

  return `你是一名严谨的量化研究员。今天是 ${reportDate}。

以下是"AI板块横截面相对强弱模型"的当日输出。该模型每天对29支AI产业链美股做多因子打分(短期反转/中期动量/残差动量/量能等,权重每日从最近约3年数据自动重估),预测未来5个交易日相对等权AI板块的强弱。**模型处于观察验证模式:历史滚动检验(2022~2026,216个窗口)胜率51.9%,统计上与随机无异,因此其输出目前只作研究参考,不是买卖依据,需实盘追踪达标后才转正。**

当日完整排名(1=最强):
${rankLines}

当日强势名单(前5,含子板块分散约束与动量门槛): ${pickLine}
当日因子权重(自动估计): ${weightLine}
实盘追踪成绩(观察模式启动以来): ${liveLine}

请通过 submit_aiquant_commentary 提交点评。硬性规则:
1. 所有数字必须来自上面提供的数据,禁止编造。
2. 必须提醒读者本模型处于观察验证阶段、历史检验不达标,解读时保持克制。
3. 不要给出"会涨/会跌"的确定性预测,只描述相对强弱格局。
4. 全部用简体中文。`;
}

export async function synthesizeAiQuantCommentary(
  reportDate: string,
  scores: DailyScore[],
  picks: DailyScore[],
  weights: FactorWeights,
  live: LiveTrackStats
): Promise<{ commentaryMd: string; usage: { input_tokens: number; output_tokens: number } }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("缺少 ANTHROPIC_API_KEY 环境变量");

  const client = new Anthropic({ apiKey, timeout: 15 * 60 * 1000 });
  const prompt = buildPrompt(reportDate, scores, picks, weights, live);

  console.log(`[synthesizeAiQuant] 调用 ${MODEL} 生成当日点评...`);
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 3000,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "submit_aiquant_commentary" },
    messages: [{ role: "user", content: prompt }],
  });
  const response = await stream.finalMessage();

  console.log(
    `[synthesizeAiQuant] stop_reason=${response.stop_reason} 输入token=${response.usage.input_tokens} 输出token=${response.usage.output_tokens}`
  );
  if (response.stop_reason === "max_tokens") {
    throw new Error("Claude 点评输出被 max_tokens 截断,已放弃本次结果");
  }

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUseBlock) throw new Error("Claude 未返回结构化点评结果");
  const raw = toolUseBlock.input as { commentary_md?: string };
  if (typeof raw.commentary_md !== "string") {
    throw new Error("Claude 返回的点评结构不符合预期");
  }

  return {
    commentaryMd: raw.commentary_md,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

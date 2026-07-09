import Anthropic from "@anthropic-ai/sdk";
import type { HoldingIndicators, HoldingDecision } from "../lib/portfolioSignals";
import type { BacktestStats } from "../lib/backtest";

// 持仓点评用 Sonnet(比其他流水线的 Haiku 贵,但这是直接影响买卖判断的模块,质量优先)。
// 定价:$3/百万输入token,$15/百万输出token。
const MODEL = "claude-sonnet-5";
export const PORTFOLIO_PRICE_PER_MTOK_INPUT = 3;
export const PORTFOLIO_PRICE_PER_MTOK_OUTPUT = 15;

const PORTFOLIO_TOOL = {
  name: "submit_portfolio_commentary",
  description: "提交对当日持仓量化信号的解读点评",
  input_schema: {
    type: "object" as const,
    properties: {
      commentary_md: {
        type: "string",
        description:
          "对当日全部持仓信号的整体解读(300字以内):哪些信号需要重视、哪些可以忽略、组合整体风险状况。只解读程序给出的信号,不要自己发明新信号或编造数字。",
      },
      rotation_md: {
        type: "string",
        description:
          "对动量轮动建议的具体解读(200字以内):如果今天有add/trim/sell建议,说明执行时的注意事项(比如分批操作、避开财报日);如果没有,说明为什么当前维持不动是合理的。",
      },
    },
    required: ["commentary_md", "rotation_md"],
  },
};

export interface PortfolioSignalInput {
  ticker: string;
  companyName: string;
  shares: number | null;
  costBasis: number | null;
  indicators: HoldingIndicators;
  decision: HoldingDecision;
}

export interface BacktestSummaryInput {
  ticker: string;
  strategy: string;
  stats: BacktestStats;
}

function fmt(n: number | null | undefined, digits = 1): string {
  return n == null ? "N/A" : n.toFixed(digits);
}

function buildPrompt(
  reportDate: string,
  signals: PortfolioSignalInput[],
  backtests: BacktestSummaryInput[]
): string {
  const holdingLines = signals
    .map((s) => {
      const ind = s.indicators;
      const d = s.decision;
      const pnl =
        s.shares != null && s.costBasis != null && ind.price != null
          ? `持仓${s.shares}股,成本${s.costBasis},浮动盈亏${(((ind.price - s.costBasis) / s.costBasis) * 100).toFixed(1)}%`
          : "未录入仓位";
      const parts = [
        `${s.ticker}(${s.companyName}): 现价=${fmt(ind.price, 2)}`,
        `1日=${fmt(ind.changePct1d)}%`,
        `趋势=${ind.trendState === "above_200" ? "200日线上方" : ind.trendState === "below_200" ? "200日线下方" : "数据不足"}`,
        `12-1动量=${fmt(ind.momentum)}%(排名${d.momentumRank ?? "N/A"})`,
        `RSI14=${fmt(ind.rsi14, 0)}`,
        `距52周高点回撤=${fmt(ind.drawdownPct)}%`,
        pnl,
        `程序建议=${d.action}${d.reasons.length > 0 ? `(${d.reasons.join(";")})` : ""}`,
      ];
      return parts.join(", ");
    })
    .join("\n");

  const backtestLines = backtests
    .map(
      (b) =>
        `${b.ticker} ${b.strategy}: 年化=${fmt(b.stats.cagrPct)}% 最大回撤=${fmt(b.stats.maxDrawdownPct)}% 夏普=${fmt(b.stats.sharpe, 2)} 换仓${b.stats.tradeCount}次 (${b.stats.startDate}~${b.stats.endDate})`
    )
    .join("\n");

  return `你是一名严谨的量化投资顾问。今天是 ${reportDate}。

以下是程序按固定规则(200日均线趋势过滤、50/200金叉死叉、12-1月动量轮动排名、52周回撤止损线、RSI极值、异常放量)对我的美股持仓自动计算出的信号。"程序建议"是代码按规则判断的客观结果,不是你的主观判断:

${holdingLines}

以下是同一套规则在过去约10年历史数据上的回测结果(未计交易成本),供你评估规则本身的可信度:

${backtestLines}

请通过 submit_portfolio_commentary 工具提交点评。硬性规则:
1. commentary_md:整体解读当日信号。所有数字必须来自上面提供的数据,禁止编造。如果某个建议的回测表现不佳(比如趋势策略在该股上跑输买入持有),要如实指出该信号可信度打折。
2. rotation_md:针对今天的 add/trim/sell 建议给出执行层面的提醒;如果全部是 hold,说明维持现状的理由。
3. 语气克制专业,不夸大不渲染。明确这是量化规则输出+研究参考,不是正式投资建议。
4. 全部用简体中文。`;
}

export async function synthesizePortfolioCommentary(
  reportDate: string,
  signals: PortfolioSignalInput[],
  backtests: BacktestSummaryInput[]
): Promise<{
  commentaryMd: string;
  rotationMd: string;
  usage: { input_tokens: number; output_tokens: number };
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 ANTHROPIC_API_KEY 环境变量");
  }

  const client = new Anthropic({ apiKey, timeout: 15 * 60 * 1000 });
  const prompt = buildPrompt(reportDate, signals, backtests);

  console.log(`[synthesizePortfolio] 调用 ${MODEL} 生成持仓点评(持仓${signals.length}支)...`);

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4000,
    tools: [PORTFOLIO_TOOL],
    tool_choice: { type: "tool", name: "submit_portfolio_commentary" },
    messages: [{ role: "user", content: prompt }],
  });
  const response = await stream.finalMessage();

  console.log(
    `[synthesizePortfolio] stop_reason=${response.stop_reason} 输入token=${response.usage.input_tokens} 输出token=${response.usage.output_tokens}`
  );

  if (response.stop_reason === "max_tokens") {
    throw new Error("Claude 持仓点评输出被 max_tokens 截断,已放弃本次结果");
  }

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUseBlock) {
    throw new Error("Claude 未返回结构化 submit_portfolio_commentary 工具调用结果");
  }

  const raw = toolUseBlock.input as { commentary_md?: string; rotation_md?: string };
  if (typeof raw.commentary_md !== "string" || typeof raw.rotation_md !== "string") {
    throw new Error("Claude 返回的点评结构不符合预期,已放弃本次结果");
  }

  return {
    commentaryMd: raw.commentary_md,
    rotationMd: raw.rotation_md,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

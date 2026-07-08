import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_QUESTION_LENGTH = 500;
const MAX_HISTORY_TURNS = 4;

interface QuantContext {
  symbol: string;
  companyName: string;
  currentPrice: number | null;
  marketCap: number | null;
  valuation: { peRatio: number | null; priceToBook: number | null; evToEbitda: number | null };
  fScore: { score: number; maxScore: number };
  zScore: { score: number; zone: string };
  priceTrend: {
    changePct1d: number | null;
    changePct5d: number | null;
    changePct20d: number | null;
    relativeVolume: number | null;
    quadrantLabel: string;
  } | null;
}

interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

function buildPrompt(ctx: QuantContext, history: HistoryTurn[], question: string): string {
  const historyBlock = history
    .map((h) => `${h.role === "user" ? "用户" : "助手"}: ${h.content}`)
    .join("\n");

  const pt = ctx.priceTrend;

  return `你是一名数据分析助手,基于下面已经计算好的量化数据回答用户关于这支股票的问题。数据来源于SEC EDGAR官方财报和Yahoo Finance价格数据,评分模型是公开发表的Piotroski F-Score与Altman Z-Score,均为程序计算的客观结果,不是你现场编的。

【股票信息】
代码: ${ctx.symbol}  公司: ${ctx.companyName}
现价: ${ctx.currentPrice != null ? `$${ctx.currentPrice}` : "N/A"}  市值: ${ctx.marketCap ?? "N/A"}
PE(最近财年): ${ctx.valuation.peRatio ?? "N/A"}  P/B(最近财年): ${ctx.valuation.priceToBook ?? "N/A"}  EV/EBITDA: ${ctx.valuation.evToEbitda ?? "N/A"}
Piotroski F-Score: ${ctx.fScore.score}/${ctx.fScore.maxScore}
Altman Z-Score: ${ctx.zScore.score} (${ctx.zScore.zone})
${
  pt
    ? `近1日涨跌: ${pt.changePct1d ?? "N/A"}%  近5日涨跌: ${pt.changePct5d ?? "N/A"}%  近20日涨跌: ${pt.changePct20d ?? "N/A"}%  相对成交量: ${pt.relativeVolume ?? "N/A"}倍  资金走势象限: ${pt.quadrantLabel}`
    : "价格走势数据: 暂无"
}

${historyBlock ? `【此前对话】\n${historyBlock}\n` : ""}
【用户问题】
${question}

回答要求:
1. 只基于上面提供的数据回答,不要编造上面没有的具体数字。
2. 如果问题问的是上面数据之外的内容(更细的财务科目、其他公司对比、未来股价预测等),如实说明数据不足或超出本工具范围,不要瞎编。
3. 不做个性化买卖决策建议(不要说"现在应该买入/卖出"),只做数据解读,可以客观描述数据反映出的强弱信号。
4. 用简体中文回答,尽量简洁,可以用要点列出。`;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "服务器未配置 ANTHROPIC_API_KEY" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const context = body.context as QuantContext | undefined;
  const rawHistory = Array.isArray(body.history) ? (body.history as HistoryTurn[]) : [];

  if (!question) {
    return NextResponse.json({ error: "请输入问题" }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ error: `问题过长,请控制在 ${MAX_QUESTION_LENGTH} 字以内` }, { status: 400 });
  }
  if (!context || typeof context.symbol !== "string") {
    return NextResponse.json({ error: "缺少股票的量化分析数据,请先查询一支股票" }, { status: 400 });
  }

  const history = rawHistory
    .filter((h) => (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
    .slice(-MAX_HISTORY_TURNS * 2)
    .map((h) => ({ role: h.role, content: h.content.slice(0, 1000) }));

  try {
    const client = new Anthropic({ apiKey, timeout: 60 * 1000 });
    const prompt = buildPrompt(context, history, question);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const answer = textBlock?.text ?? "";

    if (!answer) {
      return NextResponse.json({ error: "Claude 未返回有效回答,请重试" }, { status: 502 });
    }

    return NextResponse.json({ answer });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

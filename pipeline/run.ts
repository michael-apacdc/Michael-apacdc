import "dotenv/config";
import { fetchAllNews } from "./fetchNews";
import { fetchAllFinancials } from "./fetchFinancials";
import { synthesizeReport } from "./synthesize";
import { writeReportToDb } from "./writeToDb";
import { filterOutSeenUrls } from "./dedup";
import type { RawFinancialData, RawNewsItem } from "../lib/types";

// Anthropic claude-haiku-4-5 定价(美元/百万token),仅用于粗略估算当次花费
const PRICE_PER_MTOK_INPUT = 1;
const PRICE_PER_MTOK_OUTPUT = 5;

function todayBeijingDate(): string {
  // 报告日期按北京时间(UTC+8)计算,内容以中文/亚太视角为主
  const now = new Date();
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijing.toISOString().slice(0, 10);
}

async function main() {
  const startedAt = Date.now();
  const reportDate = todayBeijingDate();
  console.log(`\n===== 数据中心行业日报流水线启动:${reportDate} =====\n`);

  const warnings: string[] = [];

  console.log("--- 步骤 1/4: 抓取新闻 ---");
  let news: RawNewsItem[];
  try {
    news = await fetchAllNews();
    news = await filterOutSeenUrls(news, "news_items");
  } catch (err) {
    console.error(`[run] 抓取新闻整体失败: ${(err as Error).message}`);
    news = [];
    warnings.push("新闻抓取整体失败");
  }
  if (news.length === 0) {
    warnings.push("未抓取到任何新增新闻(近期新闻可能已在往日报告中出现过)");
  }

  console.log("\n--- 步骤 2/4: 抓取金融数据 ---");
  let financials: RawFinancialData[];
  try {
    financials = await fetchAllFinancials();
  } catch (err) {
    console.error(`[run] 抓取金融数据整体失败: ${(err as Error).message}`);
    financials = [];
    warnings.push("金融数据抓取整体失败");
  }

  console.log("\n--- 步骤 3/4: 调用 Claude 生成分析 ---");
  const { report, usage } = await synthesizeReport(news, financials, reportDate);
  const estimatedCostUsd =
    (usage.input_tokens / 1_000_000) * PRICE_PER_MTOK_INPUT +
    (usage.output_tokens / 1_000_000) * PRICE_PER_MTOK_OUTPUT;

  console.log("\n--- 步骤 4/4: 写入数据库 ---");
  const status = warnings.length > 0 ? "partial" : "complete";
  const durationMs = Date.now() - startedAt;
  const pipelineMeta = {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    estimated_cost_usd: Number(estimatedCostUsd.toFixed(4)),
    duration_ms: durationMs,
    warnings,
    news_fetched: news.length,
    tickers_fetched: financials.length,
  };

  const counts = await writeReportToDb(reportDate, news, financials, report, status, pipelineMeta);

  console.log(`\n===== 完成 =====`);
  console.log(`报告日期: ${reportDate}`);
  console.log(`状态: ${status}${warnings.length > 0 ? ` (${warnings.join("; ")})` : ""}`);
  console.log(
    `写入: ${counts.newsWritten} 条新闻, ${counts.picksWritten} 支个股建议, ${counts.notesWritten} 条趋势判断`
  );
  console.log(`耗时: ${(durationMs / 1000).toFixed(1)}秒`);
  console.log(`预估本次 Claude API 花费: $${estimatedCostUsd.toFixed(4)}`);
}

main().catch((err) => {
  console.error("[run] 流水线致命错误:", err);
  process.exit(1);
});

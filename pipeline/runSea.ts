import "dotenv/config";
import { fetchAllSeaNews } from "./fetchSeaNews";
import { synthesizeSeaAnalysis } from "./synthesizeSea";
import { writeSeaReportToDb } from "./writeSeaToDb";

// Anthropic claude-haiku-4-5 定价(美元/百万token),仅用于粗略估算当次花费
const PRICE_PER_MTOK_INPUT = 1;
const PRICE_PER_MTOK_OUTPUT = 5;

function todayBeijingDate(): string {
  const now = new Date();
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijing.toISOString().slice(0, 10);
}

async function main() {
  const startedAt = Date.now();
  const reportDate = todayBeijingDate();
  console.log(`\n===== 亚太数据中心选址分析流水线启动:${reportDate} =====\n`);

  console.log("--- 步骤 1/3: 抓取选址相关新闻 ---");
  const news = await fetchAllSeaNews();
  if (news.length === 0) {
    console.warn("[runSea] 未抓取到任何选址相关新闻,仍会尝试生成基于产业环境的判断");
  }

  console.log("\n--- 步骤 2/3: 调用 Claude 生成选址分析 ---");
  const { report, usage } = await synthesizeSeaAnalysis(news, reportDate);
  const estimatedCostUsd =
    (usage.input_tokens / 1_000_000) * PRICE_PER_MTOK_INPUT +
    (usage.output_tokens / 1_000_000) * PRICE_PER_MTOK_OUTPUT;

  console.log("\n--- 步骤 3/3: 写入数据库 ---");
  const counts = await writeSeaReportToDb(reportDate, report);

  const durationMs = Date.now() - startedAt;
  console.log(`\n===== 完成 =====`);
  console.log(`报告日期: ${reportDate}`);
  console.log(
    `写入: ${counts.dealsWritten} 条交易评分, ${counts.outlooksWritten} 个国家判断`
  );
  console.log(`耗时: ${(durationMs / 1000).toFixed(1)}秒`);
  console.log(`预估本次 Claude API 花费: $${estimatedCostUsd.toFixed(4)}`);
}

main().catch((err) => {
  console.error("[runSea] 流水线致命错误:", err);
  process.exit(1);
});

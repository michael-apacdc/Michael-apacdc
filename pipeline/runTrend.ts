import "dotenv/config";
import { fetchAllTrendSignals } from "./fetchTrendSignals";
import { fetchAllTrendNews } from "./fetchTrendNews";
import { synthesizeTrendAnalysis } from "./synthesizeTrend";
import { writeTrendReportToDb } from "./writeTrendToDb";
import { filterOutSeenUrls } from "./dedup";

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
  console.log(`\n===== 美股趋势研判与预警流水线启动:${reportDate} =====\n`);

  console.log("--- 步骤 1/4: 抓取跟踪个股价格/成交量信号 ---");
  const signals = await fetchAllTrendSignals();
  const alertCount = signals.filter((s) => s.alert_flag).length;
  console.log(`[runTrend] 共 ${alertCount} 支个股触发程序预警`);

  console.log("\n--- 步骤 2/4: 抓取细分行业新闻 ---");
  let news = await fetchAllTrendNews();
  news = await filterOutSeenUrls(news, "trend_news_items");
  if (news.length === 0) {
    console.warn("[runTrend] 没有新增的细分行业新闻(可能都已在往日报告中出现过)");
  }

  console.log("\n--- 步骤 3/4: 调用 Claude 生成趋势研判 ---");
  const { report, usage } = await synthesizeTrendAnalysis(news, signals, reportDate);
  const estimatedCostUsd =
    (usage.input_tokens / 1_000_000) * PRICE_PER_MTOK_INPUT +
    (usage.output_tokens / 1_000_000) * PRICE_PER_MTOK_OUTPUT;

  console.log("\n--- 步骤 4/4: 写入数据库 ---");
  const counts = await writeTrendReportToDb(reportDate, news, signals, report);

  const durationMs = Date.now() - startedAt;
  console.log(`\n===== 完成 =====`);
  console.log(`报告日期: ${reportDate}`);
  console.log(
    `写入: ${counts.signalsWritten} 支个股信号, ${counts.snapshotsWritten} 个细分行业判断, ${counts.newsWritten} 条新闻存档`
  );
  console.log(`耗时: ${(durationMs / 1000).toFixed(1)}秒`);
  console.log(`预估本次 Claude API 花费: $${estimatedCostUsd.toFixed(4)}`);
}

main().catch((err) => {
  console.error("[runTrend] 流水线致命错误:", err);
  process.exit(1);
});

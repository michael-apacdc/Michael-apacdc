import { createAdminClient } from "../lib/supabase";

// 把这次新抓到的新闻,和过去 lookbackDays 天里数据库已经记录过的新闻网址做比对,
// 过滤掉已经出现过的,只留下真正新增的新闻喂给 Claude —— 避免同一条新闻连续多天重复出现在报告里。
export async function filterOutSeenUrls<T extends { url: string }>(
  items: T[],
  table: "news_items" | "sea_news_items",
  lookbackDays = 14
): Promise<T[]> {
  if (items.length === 0) return items;

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase.from(table).select("url").gte("report_date", cutoff);
  if (error) {
    console.warn(`[dedup] 查询 ${table} 历史记录失败,跳过去重直接使用全部新闻: ${error.message}`);
    return items;
  }

  const seen = new Set((data ?? []).map((row) => row.url as string));
  const fresh = items.filter((item) => !item.url || !seen.has(item.url));

  console.log(
    `[dedup] ${table}: 过滤掉 ${items.length - fresh.length} 条近${lookbackDays}天内已报道过的新闻,剩余 ${fresh.length} 条新增新闻`
  );
  return fresh;
}

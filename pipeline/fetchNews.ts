import Parser from "rss-parser";
import type { RawNewsItem, RegionTag, SourceType } from "../lib/types";

const parser = new Parser({
  timeout: 15_000,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; DataCenterDailyBot/1.0)" },
});

interface QueryGroup {
  query: string;
  tag: RegionTag;
  lang: "en" | "zh";
}

// 定向查询清单:既覆盖英文头部媒体(用 site: 限定),也覆盖中文媒体,
// 并按查询主题预先打上一个默认地区标签(之后还会做关键词二次校正)。
const QUERY_GROUPS: QueryGroup[] = [
  { query: "data center investment OR data center capex", tag: "global", lang: "en" },
  { query: "hyperscaler AI infrastructure spending", tag: "global", lang: "en" },
  { query: "site:reuters.com data center OR AI infrastructure", tag: "global", lang: "en" },
  { query: "site:bloomberg.com data center OR AI infrastructure", tag: "global", lang: "en" },
  { query: "data center Asia Pacific investment", tag: "apac", lang: "en" },
  { query: "Southeast Asia data center Singapore Malaysia Indonesia Vietnam", tag: "sea", lang: "en" },
  { query: "China data center AI chip", tag: "china", lang: "en" },
  { query: "chip export controls data center OR AI infrastructure", tag: "geopolitics", lang: "en" },
  { query: "data center electricity power grid capacity", tag: "global", lang: "en" },
  { query: "site:36kr.com 数据中心", tag: "china", lang: "zh" },
  { query: "site:caixin.com 数据中心", tag: "china", lang: "zh" },
  { query: "数据中心 投资 东南亚", tag: "sea", lang: "zh" },
];

// 行业媒体的直连 RSS(不经过 Google News)
const TRADE_PRESS_FEEDS: { name: string; url: string }[] = [
  { name: "Data Center Knowledge", url: "https://feeds.feedburner.com/DataCenterKnowledge" },
  { name: "Data Center Dynamics", url: "https://www.datacenterdynamics.com/en/rss/" },
];

// 关键词二次校正:不管来自哪个查询组,只要标题命中这些关键词就归类到更精确的标签
const REGION_KEYWORD_RULES: { pattern: RegExp; tag: RegionTag }[] = [
  { pattern: /\b(japan|tokyo|日本)\b/i, tag: "japan" },
  { pattern: /\b(korea|seoul|韩国)\b/i, tag: "korea" },
  { pattern: /\b(india|mumbai|delhi|印度)\b/i, tag: "india" },
  { pattern: /\b(singapore|malaysia|johor|indonesia|vietnam|thailand|philippines|新加坡|马来西亚|柔佛|印尼|越南|泰国|菲律宾|东南亚)\b/i, tag: "sea" },
  { pattern: /\b(china|beijing|shanghai|中国)\b/i, tag: "china" },
  { pattern: /\b(export control|sanction|tariff|geopolit|national security|出口管制|制裁|地缘政治)\b/i, tag: "geopolitics" },
];

function refineRegionTag(headline: string, snippet: string, fallback: RegionTag): RegionTag {
  const text = `${headline} ${snippet}`;
  for (const rule of REGION_KEYWORD_RULES) {
    if (rule.pattern.test(text)) return rule.tag;
  }
  return fallback;
}

function buildGoogleNewsUrl(query: string, lang: "en" | "zh"): string {
  const encoded = encodeURIComponent(query);
  if (lang === "zh") {
    return `https://news.google.com/rss/search?q=${encoded}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
  }
  return `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;
}

// Google News RSS 的标题格式固定为 "正文标题 - 发布媒体",从末尾提取真实媒体名,
// 避免 source_name 显示成查询字符串本身。
function extractGoogleNewsSource(headline: string, fallback: string): {
  source: string;
  cleanHeadline: string;
} {
  const idx = headline.lastIndexOf(" - ");
  if (idx === -1) return { source: fallback, cleanHeadline: headline };
  return { source: headline.slice(idx + 3).trim(), cleanHeadline: headline.slice(0, idx).trim() };
}

async function fetchOneFeed(
  url: string,
  sourceType: SourceType,
  fallbackSourceName: string,
  tag: RegionTag
): Promise<RawNewsItem[]> {
  try {
    const feed = await parser.parseURL(url);
    // 每路查询只取前10条,而非20条:第一次真实运行时264条新闻喂给Claude
    // 累计到7.5万输入token,导致响应过慢触发了API超时。减半控制输入体积。
    return (feed.items ?? []).slice(0, 10).map((item) => {
      const rawHeadline = item.title ?? "(无标题)";
      const snippet = item.contentSnippet ?? item.content ?? "";

      let headline = rawHeadline;
      let sourceName = item.creator ?? feed.title ?? fallbackSourceName;
      if (sourceType === "google_news_rss") {
        const extracted = extractGoogleNewsSource(rawHeadline, fallbackSourceName);
        headline = extracted.cleanHeadline;
        sourceName = extracted.source;
      }

      return {
        source_name: sourceName,
        source_type: sourceType,
        headline,
        url: item.link ?? "",
        published_at: item.isoDate ?? item.pubDate ?? null,
        region_tag: refineRegionTag(headline, snippet, tag),
        raw_snippet: snippet ? snippet.slice(0, 500) : null,
      };
    });
  } catch (err) {
    console.warn(`[fetchNews] WARNING: 抓取失败 ${url}: ${(err as Error).message}`);
    return [];
  }
}

export async function fetchAllNews(): Promise<RawNewsItem[]> {
  const results: RawNewsItem[] = [];

  console.log(`[fetchNews] 开始抓取 ${QUERY_GROUPS.length} 组 Google News 查询...`);
  for (const group of QUERY_GROUPS) {
    const url = buildGoogleNewsUrl(group.query, group.lang);
    const items = await fetchOneFeed(url, "google_news_rss", "Google News", group.tag);
    console.log(`[fetchNews]   "${group.query}" -> ${items.length} 条`);
    results.push(...items);
  }

  console.log(`[fetchNews] 开始抓取 ${TRADE_PRESS_FEEDS.length} 个行业媒体 RSS...`);
  for (const feed of TRADE_PRESS_FEEDS) {
    let items = await fetchOneFeed(feed.url, "trade_press_rss", feed.name, "global");
    if (items.length === 0) {
      // 降级:直连 RSS 失败时,改用 Google News 站内查询兜底
      const domain = new URL(feed.url).hostname.replace(/^www\./, "");
      console.warn(`[fetchNews]   ${feed.name} 直连RSS为空,降级为 Google News site: 查询兜底`);
      const fallbackUrl = buildGoogleNewsUrl(`site:${domain}`, "en");
      items = await fetchOneFeed(fallbackUrl, "google_news_rss", feed.name, "global");
    }
    console.log(`[fetchNews]   ${feed.name} -> ${items.length} 条`);
    results.push(...items);
  }

  // 按 URL 去重
  const seen = new Set<string>();
  const deduped = results.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  console.log(`[fetchNews] 去重后共 ${deduped.length} 条新闻(原始 ${results.length} 条)`);
  return deduped;
}

import Parser from "rss-parser";
import type { RawNewsItem, SeaCountryCode } from "../lib/types";

const parser = new Parser({
  timeout: 15_000,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; DataCenterDailyBot/1.0)" },
});

interface CountryQuery {
  country: SeaCountryCode;
  query: string;
}

// 针对每个国家的"拿地+签电力协议"定向查询 —— 关键词聚焦土地、变电站、PPA、可再生能源等,
// 与主日报的宽泛行业新闻查询区分开,专门为选址分析服务。
const COUNTRY_QUERIES: CountryQuery[] = [
  { country: "SG", query: "Singapore data center land power substation MW" },
  { country: "SG", query: "Singapore data center renewable energy PPA" },
  { country: "MY", query: "Malaysia Johor data center land acquisition power" },
  { country: "MY", query: "Malaysia data center substation MW solar power agreement" },
  { country: "TH", query: "Thailand data center land power purchase agreement" },
  { country: "TH", query: "Thailand data center investment industrial estate power" },
  { country: "ID", query: "Indonesia data center land power grid MW" },
  { country: "ID", query: "Indonesia data center renewable energy investment" },
  { country: "JP", query: "Japan data center land substation power grid MW" },
  { country: "JP", query: "Japan data center renewable nuclear power agreement" },
  { country: "AU", query: "Australia data center land power purchase agreement MW" },
  { country: "AU", query: "Australia data center renewable energy hyperscaler land" },
];

function buildGoogleNewsUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function extractGoogleNewsSource(headline: string, fallback: string): {
  source: string;
  cleanHeadline: string;
} {
  const idx = headline.lastIndexOf(" - ");
  if (idx === -1) return { source: fallback, cleanHeadline: headline };
  return { source: headline.slice(idx + 3).trim(), cleanHeadline: headline.slice(0, idx).trim() };
}

export interface RawSeaNewsItem extends RawNewsItem {
  sea_country: SeaCountryCode;
}

export async function fetchAllSeaNews(): Promise<RawSeaNewsItem[]> {
  const results: RawSeaNewsItem[] = [];

  console.log(`[fetchSeaNews] 开始抓取 ${COUNTRY_QUERIES.length} 组选址定向查询...`);
  for (const { country, query } of COUNTRY_QUERIES) {
    try {
      const feed = await parser.parseURL(buildGoogleNewsUrl(query));
      const items = (feed.items ?? []).slice(0, 10).map((item) => {
        const rawHeadline = item.title ?? "(无标题)";
        const { source, cleanHeadline } = extractGoogleNewsSource(rawHeadline, "Google News");
        return {
          source_name: source,
          source_type: "google_news_rss" as const,
          headline: cleanHeadline,
          url: item.link ?? "",
          published_at: item.isoDate ?? item.pubDate ?? null,
          region_tag: "sea" as const,
          raw_snippet: (item.contentSnippet ?? item.content ?? "").slice(0, 500) || null,
          sea_country: country,
        };
      });
      console.log(`[fetchSeaNews]   [${country}] "${query}" -> ${items.length} 条`);
      results.push(...items);
    } catch (err) {
      console.warn(`[fetchSeaNews] WARNING: [${country}] "${query}" 抓取失败: ${(err as Error).message}`);
    }
  }

  const seen = new Set<string>();
  const deduped = results.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  console.log(`[fetchSeaNews] 去重后共 ${deduped.length} 条选址相关新闻(原始 ${results.length} 条)`);
  return deduped;
}

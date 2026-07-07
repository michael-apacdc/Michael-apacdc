import Parser from "rss-parser";
import type { RawNewsItem, TrendSubsectorCode } from "../lib/types";

const parser = new Parser({
  timeout: 15_000,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; DataCenterDailyBot/1.0)" },
});

interface SubsectorQuery {
  subsector: TrendSubsectorCode;
  query: string;
}

const SUBSECTOR_QUERIES: SubsectorQuery[] = [
  { subsector: "chip", query: "AI chip stocks NVIDIA AMD Broadcom news" },
  { subsector: "optical", query: "optical transceiver AI data center stocks news" },
  { subsector: "datacenter", query: "data center REIT stocks Equinix Digital Realty news" },
  { subsector: "storage", query: "data center storage memory stocks Micron Western Digital news" },
  { subsector: "liquid_cooling", query: "data center liquid cooling stocks Vertiv news" },
  { subsector: "energy", query: "AI data center power utility stocks Vistra Constellation news" },
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

export interface RawTrendNewsItem extends RawNewsItem {
  subsector_code: TrendSubsectorCode;
}

export async function fetchAllTrendNews(): Promise<RawTrendNewsItem[]> {
  const results: RawTrendNewsItem[] = [];

  console.log(`[fetchTrendNews] 开始抓取 ${SUBSECTOR_QUERIES.length} 组细分行业定向查询...`);
  for (const { subsector, query } of SUBSECTOR_QUERIES) {
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
          region_tag: "global" as const,
          raw_snippet: (item.contentSnippet ?? item.content ?? "").slice(0, 500) || null,
          subsector_code: subsector,
        };
      });
      console.log(`[fetchTrendNews]   [${subsector}] "${query}" -> ${items.length} 条`);
      results.push(...items);
    } catch (err) {
      console.warn(`[fetchTrendNews] WARNING: [${subsector}] "${query}" 抓取失败: ${(err as Error).message}`);
    }
  }

  const seen = new Set<string>();
  const deduped = results.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  console.log(`[fetchTrendNews] 去重后共 ${deduped.length} 条细分行业新闻(原始 ${results.length} 条)`);
  return deduped;
}

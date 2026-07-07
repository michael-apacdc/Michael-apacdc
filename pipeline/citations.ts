// 把正文里的 [12] 或 [12,45,103] 这种引用编号替换成放大镜图标链接(每个编号一个链接),
// 而不是直接显示数字 —— 数字挨在一起在网页上会连成一串看不清的乱码。
// 编号无效(超出范围)时原样保留文字,不当成链接处理。
// 三条流水线(主日报/选址分析/趋势研判)共用这一套引用解析逻辑。
const CITATION_ICON = "🔍";
const CITATION_GAP = " "; // 窄空格,让相邻的引用图标之间留一点缝隙

export function resolveCitationsInText(text: string, urlByIndex: Map<number, string>): string {
  return text.replace(/\[(\d{1,4}(?:\s*,\s*\d{1,4})*)\](?!\()/g, (match, idsStr: string) => {
    const links = idsStr
      .split(",")
      .map((s: string) => urlByIndex.get(Number(s.trim())))
      .filter((url: string | undefined): url is string => Boolean(url))
      .map((url: string) => `[${CITATION_ICON}](${url})`);
    return links.length > 0 ? links.join(CITATION_GAP) : match;
  });
}

export function resolveNewsIds(ids: number[] | undefined, urlByIndex: Map<number, string>): string[] {
  if (!ids) return [];
  const urls: string[] = [];
  for (const id of ids) {
    const url = urlByIndex.get(id);
    if (url) urls.push(url);
  }
  return urls;
}

export function buildUrlIndex(news: { url: string }[]): Map<number, string> {
  return new Map<number, string>(news.map((n, i) => [i + 1, n.url]));
}

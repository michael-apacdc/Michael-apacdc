import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ReportSection({
  index,
  title,
  content,
}: {
  index: string;
  title: string;
  content: string | null;
}) {
  return (
    <section className="rounded-md border border-line bg-surface p-6 transition-colors hover:border-line-strong">
      <div className="mb-4 flex items-center gap-3">
        <span className="font-mono text-xs text-accent">{index}</span>
        <span className="h-px flex-1 bg-line" />
        <h2 className="text-sm font-medium tracking-wide text-foreground">{title}</h2>
      </div>
      {content ? (
        <div className="prose prose-invert prose-sm max-w-none prose-a:text-accent prose-a:no-underline hover:prose-a:underline">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : (
        <p className="font-mono text-xs text-muted">今日暂无此板块内容</p>
      )}
    </section>
  );
}

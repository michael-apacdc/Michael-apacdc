import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ReportSection({
  title,
  content,
}: {
  title: string;
  content: string | null;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">{title}</h2>
      {content ? (
        <div className="prose prose-slate prose-sm max-w-none prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-slate-400">今日暂无此板块内容</p>
      )}
    </section>
  );
}

export default function Disclaimer({ content }: { content: string | null }) {
  const text =
    content ??
    "此报告仅为基于公开新闻信息的研究分析,不构成正式投资建议,投资决策需自行判断风险,请独立核实信息准确性。";
  return (
    <p className="rounded-md border border-warning/25 bg-warning/5 p-4 font-mono text-[11px] leading-relaxed text-warning/90">
      {text}
    </p>
  );
}

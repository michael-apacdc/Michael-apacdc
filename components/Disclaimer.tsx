export default function Disclaimer({ content }: { content: string | null }) {
  const text =
    content ??
    "此报告仅为基于公开新闻信息的研究分析,不构成正式投资建议,投资决策需自行判断风险,请独立核实信息准确性。";
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-800">
      {text}
    </p>
  );
}

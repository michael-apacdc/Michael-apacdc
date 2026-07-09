// 我的持仓清单 —— 目前是示例持仓,换成真实持仓时直接改这里,
// 并在 Supabase 的 portfolio_holdings 表里同步改一下(或删掉表里的示例行重新插入)。
// shares / costBasis 填 null 表示只监控信号、不计算盈亏。

export interface HoldingDef {
  ticker: string;
  companyName: string;
  shares: number | null;
  costBasis: number | null; // 每股成本(美元)
}

export const PORTFOLIO_HOLDINGS: HoldingDef[] = [
  { ticker: "NVDA", companyName: "NVIDIA", shares: 40, costBasis: 950 },
  { ticker: "MSFT", companyName: "Microsoft", shares: 30, costBasis: 420 },
  { ticker: "AAPL", companyName: "Apple", shares: 50, costBasis: 190 },
  { ticker: "AMZN", companyName: "Amazon", shares: 30, costBasis: 180 },
  { ticker: "TSLA", companyName: "Tesla", shares: 20, costBasis: 250 },
];

// 积极(动量轮动)风格的规则参数。想改松紧只需要调这里,回测会用同一套参数验证。
export const PORTFOLIO_RULES = {
  drawdownAlertPct: -15, // 从52周高点回撤超过15%强制预警(风险控制底线)
  rsiOverbought: 75,
  rsiOversold: 25,
  dailyMoveAlertPct: 5, // 单日涨跌超过5%预警(和趋势模块同口径)
  relativeVolumeAlert: 2.5, // 放量预警阈值(和趋势模块同口径)
  rotationTopN: 3, // 动量轮动:建议超配动量排名前N的持仓
  backtestYears: 10, // 回测使用的历史年数
};

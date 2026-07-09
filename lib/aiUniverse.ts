// AI产业链核心股票池 —— 新横截面模型的分析范围。
// 模型比较的是"AI板块内部谁强谁弱",所以池子要覆盖产业链各环节、且都是流动性好的美股。
// 增删股票改这里即可,历史不足一年的新股会自动在数据够用后进入横截面。

export type AiSubsector =
  | "chip" // 芯片/半导体
  | "network_optical" // 网络/光模块
  | "hyperscaler" // 云巨头/超大规模
  | "ai_software" // AI软件/应用
  | "hardware" // 服务器/终端硬件
  | "power"; // 电力/散热

export const AI_SUBSECTOR_NAMES: Record<AiSubsector, string> = {
  chip: "芯片",
  network_optical: "网络/光模块",
  hyperscaler: "云巨头",
  ai_software: "AI软件",
  hardware: "硬件/整机",
  power: "电力/散热",
};

export interface AiUniverseStock {
  ticker: string;
  companyName: string;
  subsector: AiSubsector;
}

export const AI_UNIVERSE: AiUniverseStock[] = [
  { ticker: "NVDA", companyName: "NVIDIA", subsector: "chip" },
  { ticker: "AMD", companyName: "AMD", subsector: "chip" },
  { ticker: "AVGO", companyName: "Broadcom", subsector: "chip" },
  { ticker: "TSM", companyName: "台积电", subsector: "chip" },
  { ticker: "MRVL", companyName: "Marvell", subsector: "chip" },
  { ticker: "MU", companyName: "美光", subsector: "chip" },
  { ticker: "QCOM", companyName: "高通", subsector: "chip" },
  { ticker: "INTC", companyName: "英特尔", subsector: "chip" },
  { ticker: "ARM", companyName: "Arm", subsector: "chip" },
  { ticker: "ANET", companyName: "Arista Networks", subsector: "network_optical" },
  { ticker: "COHR", companyName: "Coherent", subsector: "network_optical" },
  { ticker: "LITE", companyName: "Lumentum", subsector: "network_optical" },
  { ticker: "CIEN", companyName: "Ciena", subsector: "network_optical" },
  { ticker: "MSFT", companyName: "微软", subsector: "hyperscaler" },
  { ticker: "GOOGL", companyName: "谷歌", subsector: "hyperscaler" },
  { ticker: "AMZN", companyName: "亚马逊", subsector: "hyperscaler" },
  { ticker: "META", companyName: "Meta", subsector: "hyperscaler" },
  { ticker: "ORCL", companyName: "甲骨文", subsector: "hyperscaler" },
  { ticker: "PLTR", companyName: "Palantir", subsector: "ai_software" },
  { ticker: "NOW", companyName: "ServiceNow", subsector: "ai_software" },
  { ticker: "CRWD", companyName: "CrowdStrike", subsector: "ai_software" },
  { ticker: "SNOW", companyName: "Snowflake", subsector: "ai_software" },
  { ticker: "SMCI", companyName: "Super Micro", subsector: "hardware" },
  { ticker: "DELL", companyName: "戴尔", subsector: "hardware" },
  { ticker: "AAPL", companyName: "苹果", subsector: "hardware" },
  { ticker: "TSLA", companyName: "特斯拉", subsector: "hardware" },
  { ticker: "VRT", companyName: "Vertiv", subsector: "power" },
  { ticker: "CEG", companyName: "Constellation Energy", subsector: "power" },
  { ticker: "VST", companyName: "Vistra", subsector: "power" },
];

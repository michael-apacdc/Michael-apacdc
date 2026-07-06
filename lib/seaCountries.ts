import type { SeaCountryCode } from "./types";

export const SEA_COUNTRY_NAMES: Record<SeaCountryCode, string> = {
  SG: "新加坡",
  MY: "马来西亚",
  TH: "泰国",
  ID: "印度尼西亚",
  JP: "日本",
  AU: "澳大利亚",
  KR: "韩国",
};

export const SEA_COUNTRY_CODES = Object.keys(SEA_COUNTRY_NAMES) as SeaCountryCode[];

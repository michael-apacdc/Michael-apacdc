-- Phase 4(重构): AI板块横截面相对强弱模型(观察验证模式) -- 数据库 schema
-- 在 Supabase 项目的 SQL Editor 里执行一次。
-- 如果之前执行过旧版 schema_portfolio.sql,先删掉旧表:
--   drop table if exists portfolio_signal, portfolio_snapshot, portfolio_backtest, portfolio_holdings cascade;

-- 每天全池打分(29支AI股的得分与排名),供页面展示完整排名表
create table if not exists ai_quant_scores (
  id            uuid primary key default gen_random_uuid(),
  report_date   date not null,
  ticker        text not null,
  subsector     text not null,
  score         numeric,          -- 合成得分(横截面可比,越大越强)
  rank_position integer,          -- 1 = 最强;数据不足未参与排名时为 null
  factor_z      jsonb,            -- 各因子z值明细
  unique (report_date, ticker)
);
create index if not exists idx_ai_quant_scores_date on ai_quant_scores (report_date);

-- 每天的强势名单(前5,含子板块分散与动量门槛约束),以及事后追踪结果。
-- 这是"观察模式"的核心:每条信号在5个交易日后自动回填真实结果,页面公示实盘成功率。
create table if not exists ai_quant_picks (
  id             uuid primary key default gen_random_uuid(),
  report_date    date not null,
  ticker         text not null,
  rank_position  integer not null, -- 在当日名单中的名次 1..5
  score          numeric,
  entry_adjclose numeric not null, -- 信号日复权收盘价
  resolved       boolean not null default false,
  resolve_date   date,             -- 5个交易日后的那一天
  fwd_return_pct     numeric,      -- 信号日→resolve_date 的个股收益 %
  basket_return_pct  numeric,      -- 同期等权AI板块收益 %
  excess_return_pct  numeric,      -- 超额 = 个股 - 板块
  hit            boolean,          -- excess_return_pct > 0
  unique (report_date, ticker)
);
create index if not exists idx_ai_quant_picks_date on ai_quant_picks (report_date);
create index if not exists idx_ai_quant_picks_unresolved on ai_quant_picks (resolved) where not resolved;

-- 每天一行:当日权重、Claude点评、实盘追踪汇总
create table if not exists ai_quant_snapshot (
  id            uuid primary key default gen_random_uuid(),
  report_date   date not null unique,
  weights       jsonb not null,   -- 当日自动估计的因子权重
  commentary_md text,
  resolved_picks   integer not null default 0, -- 截至当日已回填结果的信号数
  resolved_hits    integer not null default 0, -- 其中跑赢板块的数量
  avg_excess_pct   numeric,                    -- 已回填信号的平均超额收益 %
  day_windows      integer not null default 0, -- 按"信号日"聚合的窗口数
  day_wins         integer not null default 0  -- 当日前5平均超额>0 的窗口数
);

-- 滚动季度样本外检验记录(2022~2026,静态历史事实,由研究阶段一次性写入)。
-- 这是模型的"体检报告",页面必须如实展示 —— 结论:胜率51.9%,统计上与抛硬币无法区分,
-- 所以本模型以观察模式发布,用实盘追踪自证,未经实盘达标不作为正式买卖依据。
create table if not exists ai_quant_validation (
  id                uuid primary key default gen_random_uuid(),
  period_label      text not null unique, -- 'YYYY-QN' 或 'TOTAL'
  wins              integer not null,
  windows           integer not null,
  strat_return_pct  numeric,
  basket_return_pct numeric,
  excess_pp         numeric
);

insert into ai_quant_validation (period_label, wins, windows, strat_return_pct, basket_return_pct, excess_pp) values
  ('2022-Q1',  8, 12,  -7.5,  -9.6,   2.1),
  ('2022-Q2',  2, 12, -28.7, -21.8,  -6.9),
  ('2022-Q3',  6, 12,  -8.0,  -2.1,  -5.9),
  ('2022-Q4',  7, 12,  -9.2,  -5.6,  -3.6),
  ('2023-Q1',  3, 12,  -1.3,  23.1, -24.4),
  ('2023-Q2',  8, 12,  24.2,  24.1,   0.1),
  ('2023-Q3',  8, 12,  13.7,  -0.3,  14.0),
  ('2023-Q4',  6, 12,  11.6,  21.3,  -9.7),
  ('2024-Q1',  8, 12,  32.8,  33.9,  -1.1),
  ('2024-Q2',  6, 12,  11.9,   9.2,   2.7),
  ('2024-Q3',  6, 12,  -0.9,   2.9,  -3.8),
  ('2024-Q4',  4, 12,  15.4,  20.6,  -5.2),
  ('2025-Q1',  4, 11, -22.8,  -4.8, -18.0),
  ('2025-Q2',  6, 12,  31.6,  35.6,  -4.0),
  ('2025-Q3',  6, 12,  24.9,  20.8,   4.1),
  ('2025-Q4',  7, 12,  16.9,   6.1,  10.9),
  ('2026-Q1',  9, 12,  30.3,  -0.1,  30.4),
  ('2026-Q2',  8, 13,  60.9,  40.8,  20.2),
  ('TOTAL',  112, 216, 353.0, 409.0, -56.0)
on conflict (period_label) do nothing;

alter table ai_quant_scores enable row level security;
alter table ai_quant_picks enable row level security;
alter table ai_quant_snapshot enable row level security;
alter table ai_quant_validation enable row level security;

create policy "public read ai_quant_scores" on ai_quant_scores for select using (true);
create policy "public read ai_quant_picks" on ai_quant_picks for select using (true);
create policy "public read ai_quant_snapshot" on ai_quant_snapshot for select using (true);
create policy "public read ai_quant_validation" on ai_quant_validation for select using (true);

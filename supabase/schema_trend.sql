-- Phase 3: 美股趋势研判与预警(AI产业细分) -- 数据库 schema
-- 在 Supabase 项目的 SQL Editor 里执行一次(在 schema.sql / schema_sea.sql 之后执行)

create table if not exists trend_subsectors (
  code    text primary key, -- 'chip' | 'optical' | 'datacenter' | 'storage' | 'liquid_cooling' | 'energy'
  name_zh text not null
);

insert into trend_subsectors (code, name_zh) values
  ('chip', '芯片'),
  ('optical', '光模块'),
  ('datacenter', '数据中心'),
  ('storage', '存储'),
  ('liquid_cooling', '液冷'),
  ('energy', '能源')
on conflict (code) do nothing;

-- 跟踪个股清单,可随时增删而不改代码
create table if not exists trend_tickers (
  ticker         text primary key,
  subsector_code text not null references trend_subsectors(code),
  company_name   text not null,
  active         boolean not null default true
);

insert into trend_tickers (ticker, subsector_code, company_name) values
  ('NVDA', 'chip', 'NVIDIA'),
  ('AMD', 'chip', 'Advanced Micro Devices'),
  ('AVGO', 'chip', 'Broadcom'),
  ('TSM', 'chip', 'Taiwan Semiconductor'),
  ('MRVL', 'chip', 'Marvell Technology'),
  ('COHR', 'optical', 'Coherent'),
  ('LITE', 'optical', 'Lumentum'),
  ('FN', 'optical', 'Fabrinet'),
  ('CIEN', 'optical', 'Ciena'),
  ('AAOI', 'optical', 'Applied Optoelectronics'),
  ('EQIX', 'datacenter', 'Equinix'),
  ('DLR', 'datacenter', 'Digital Realty'),
  ('IRM', 'datacenter', 'Iron Mountain'),
  ('WDC', 'storage', 'Western Digital'),
  ('STX', 'storage', 'Seagate Technology'),
  ('PSTG', 'storage', 'Pure Storage'),
  ('NTAP', 'storage', 'NetApp'),
  ('MU', 'storage', 'Micron Technology'),
  ('VRT', 'liquid_cooling', 'Vertiv'),
  ('NVT', 'liquid_cooling', 'nVent Electric'),
  ('MOD', 'liquid_cooling', 'Modine Manufacturing'),
  ('VST', 'energy', 'Vistra'),
  ('CEG', 'energy', 'Constellation Energy'),
  ('NEE', 'energy', 'NextEra Energy'),
  ('NRG', 'energy', 'NRG Energy')
on conflict (ticker) do nothing;

-- 每天每支个股一行:价格与成交量信号(免费代理指标,不是真实机构资金流数据)
create table if not exists trend_ticker_signal (
  id                uuid primary key default gen_random_uuid(),
  report_date       date not null,
  ticker            text not null references trend_tickers(ticker),
  subsector_code    text not null references trend_subsectors(code),
  price             numeric,
  change_pct_1d     numeric,
  change_pct_5d     numeric,
  avg_volume_20d     numeric,
  relative_volume   numeric,       -- 今日成交量 / 20日平均成交量,用作资金关注度的免费代理指标
  alert_flag        boolean not null default false,  -- 程序按规则检测的异常波动(不是AI判断)
  alert_reason      text,
  unique (report_date, ticker)
);
create index if not exists idx_trend_signal_date on trend_ticker_signal (report_date);
create index if not exists idx_trend_signal_subsector on trend_ticker_signal (subsector_code, report_date);

-- 每天每个细分行业一行:趋势方向判断 + 预警叙述
create table if not exists trend_subsector_snapshot (
  id              uuid primary key default gen_random_uuid(),
  report_date     date not null,
  subsector_code  text not null references trend_subsectors(code),
  trend_direction text check (trend_direction in ('warming', 'cooling', 'stable', 'mixed')),
  summary_md      text not null,
  alert_summary_md text,           -- 若该细分行业存在预警信号,这里给出综合解读;否则为 null
  source_urls     text[] not null default '{}',
  unique (report_date, subsector_code)
);
create index if not exists idx_trend_snapshot_date on trend_subsector_snapshot (report_date);

-- 每天抓取到的原始细分行业新闻(去重前),仅用于跨天比对网址
create table if not exists trend_news_items (
  id             uuid primary key default gen_random_uuid(),
  report_date    date not null,
  subsector_code text references trend_subsectors(code),
  headline       text not null,
  url            text not null,
  source_name    text
);
create index if not exists idx_trend_news_items_date on trend_news_items (report_date);
create index if not exists idx_trend_news_items_url on trend_news_items (url);

alter table trend_subsectors enable row level security;
alter table trend_tickers enable row level security;
alter table trend_ticker_signal enable row level security;
alter table trend_subsector_snapshot enable row level security;
alter table trend_news_items enable row level security;

create policy "public read trend_subsectors" on trend_subsectors for select using (true);
create policy "public read trend_tickers" on trend_tickers for select using (true);
create policy "public read trend_ticker_signal" on trend_ticker_signal for select using (true);
create policy "public read trend_subsector_snapshot" on trend_subsector_snapshot for select using (true);
create policy "public read trend_news_items" on trend_news_items for select using (true);

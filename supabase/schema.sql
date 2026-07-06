-- 全球数据中心行业趋势与投资分析 -- Phase 1 数据库 schema
-- 在 Supabase 项目的 SQL Editor 里执行一次即可(执行前请确认是空项目,重复执行会因 "already exists" 报错但不会破坏数据)

create extension if not exists "pgcrypto";

-- 每天一行,存报告正文各板块
create table if not exists daily_reports (
  id                  uuid primary key default gen_random_uuid(),
  report_date         date not null unique,
  generated_at        timestamptz not null default now(),
  status              text not null default 'complete' check (status in ('complete', 'partial', 'failed')),
  news_summary_md      text,
  apac_investment_md   text,
  geopolitics_md       text,
  trend_judgment_md    text,
  competitive_md       text,
  disclaimer_md        text,
  raw_pipeline_meta    jsonb
);

-- 当天抓取的每条新闻,作为可追溯的信源底稿
create table if not exists news_items (
  id              uuid primary key default gen_random_uuid(),
  report_date     date not null references daily_reports(report_date) on delete cascade,
  source_name     text not null,
  source_type     text not null check (source_type in ('google_news_rss', 'trade_press_rss', 'direct_rss')),
  headline        text not null,
  url             text not null,
  published_at    timestamptz,
  region_tag      text check (region_tag in ('global', 'apac', 'china', 'japan', 'korea', 'india', 'sea', 'geopolitics')),
  used_in_section text[],
  raw_snippet     text
);
create index if not exists idx_news_items_report_date on news_items (report_date);
create index if not exists idx_news_items_region_tag on news_items (region_tag);

-- 跟踪的个股主列表,可随时增删而不改代码
create table if not exists tracked_tickers (
  ticker        text primary key,
  company_name  text not null,
  category      text not null check (category in ('hyperscaler', 'colo_operator', 'chipmaker', 'power_utility', 'equipment', 'other')),
  active        boolean not null default true,
  added_at      timestamptz not null default now()
);

-- 每支个股每天一行,支撑"目标价随时间变化"的趋势图
create table if not exists stock_picks (
  id                       uuid primary key default gen_random_uuid(),
  report_date              date not null references daily_reports(report_date) on delete cascade,
  ticker                   text not null references tracked_tickers(ticker),
  current_price            numeric,
  currency                 text default 'USD',
  pe_ratio                 numeric,
  ev_ebitda                numeric,
  target_price_low         numeric,
  target_price_avg         numeric,
  target_price_high        numeric,
  analyst_rating_consensus text,
  claude_rating            text not null check (claude_rating in ('bullish', 'neutral', 'bearish')),
  position_size_pct        numeric,
  rationale_md             text not null,
  source_urls              text[] not null default '{}',
  data_source_note         text,
  unique (report_date, ticker)
);
create index if not exists idx_stock_picks_ticker_date on stock_picks (ticker, report_date);

-- 不挂靠单只股票的行业判断(需求/供给/电力散热/资本流向/地缘政治)
create table if not exists trend_notes (
  id            uuid primary key default gen_random_uuid(),
  report_date   date not null references daily_reports(report_date) on delete cascade,
  category      text not null check (category in ('demand', 'supply', 'power_cooling', 'capital_flows', 'geopolitics')),
  note_md       text not null,
  source_urls   text[] not null default '{}',
  confidence    text check (confidence in ('high', 'medium', 'low'))
);
create index if not exists idx_trend_notes_category_date on trend_notes (category, report_date);

-- 初始跟踪个股清单
insert into tracked_tickers (ticker, company_name, category) values
  ('NVDA', 'NVIDIA', 'chipmaker'),
  ('AMD', 'Advanced Micro Devices', 'chipmaker'),
  ('AVGO', 'Broadcom', 'chipmaker'),
  ('TSM', 'Taiwan Semiconductor', 'chipmaker'),
  ('MRVL', 'Marvell Technology', 'chipmaker'),
  ('VST', 'Vistra', 'power_utility'),
  ('CEG', 'Constellation Energy', 'power_utility'),
  ('NEE', 'NextEra Energy', 'power_utility'),
  ('NRG', 'NRG Energy', 'power_utility'),
  ('VRT', 'Vertiv', 'equipment'),
  ('ETN', 'Eaton', 'equipment'),
  ('MSFT', 'Microsoft', 'hyperscaler'),
  ('AMZN', 'Amazon', 'hyperscaler'),
  ('GOOGL', 'Alphabet', 'hyperscaler'),
  ('ORCL', 'Oracle', 'hyperscaler'),
  ('META', 'Meta Platforms', 'hyperscaler'),
  ('EQIX', 'Equinix', 'colo_operator'),
  ('DLR', 'Digital Realty', 'colo_operator'),
  ('IRM', 'Iron Mountain', 'colo_operator')
on conflict (ticker) do nothing;

-- 行级安全:允许公开只读(网页前端用 anon key 读),写入仅限 service_role(流水线用)
alter table daily_reports enable row level security;
alter table news_items enable row level security;
alter table tracked_tickers enable row level security;
alter table stock_picks enable row level security;
alter table trend_notes enable row level security;

create policy "public read daily_reports" on daily_reports for select using (true);
create policy "public read news_items" on news_items for select using (true);
create policy "public read tracked_tickers" on tracked_tickers for select using (true);
create policy "public read stock_picks" on stock_picks for select using (true);
create policy "public read trend_notes" on trend_notes for select using (true);

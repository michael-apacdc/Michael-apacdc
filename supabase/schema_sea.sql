-- Phase 2: 东南亚/亚太数据中心选址分析 -- 数据库 schema
-- 在 Supabase 项目的 SQL Editor 里执行一次(在 schema.sql 之后执行)

-- 跟踪的国家/地区清单
create table if not exists sea_countries (
  code     text primary key, -- 'SG' | 'MY' | 'TH' | 'ID' | 'JP' | 'AU'
  name_zh  text not null
);

insert into sea_countries (code, name_zh) values
  ('SG', '新加坡'),
  ('MY', '马来西亚'),
  ('TH', '泰国'),
  ('ID', '印度尼西亚'),
  ('JP', '日本'),
  ('AU', '澳大利亚')
on conflict (code) do nothing;

-- 每天一行/每国一行:宏观投资热度排名与理由
create table if not exists sea_country_outlook (
  id                   uuid primary key default gen_random_uuid(),
  report_date          date not null,
  country_code         text not null references sea_countries(code),
  attractiveness_score numeric,      -- 0-100,Claude给出的综合投资吸引力判断
  rank_position        integer,      -- 当次排名,1=当前最值得关注
  outlook_md           text not null, -- 叙述性判断,附来源链接
  source_urls          text[] not null default '{}',
  unique (report_date, country_code)
);
create index if not exists idx_sea_outlook_date on sea_country_outlook (report_date);

-- 每条具体的"拿地+签电力协议"新闻事件,按六维度框架打分
create table if not exists sea_deals (
  id                        uuid primary key default gen_random_uuid(),
  report_date               date not null,
  country_code              text not null references sea_countries(code),
  company                   text not null,
  headline                  text not null,
  deal_summary_md           text not null,
  land_location             text,          -- 新闻披露的地块/地区描述,未披露则为 null

  power_score               integer,       -- 1-5,权重38%
  power_notes_md            text,
  connectivity_score        integer,       -- 1-5,权重22%
  connectivity_notes_md     text,
  land_civil_score          integer,       -- 1-5,权重15%
  land_civil_notes_md       text,
  policy_score              integer,       -- 1-5,权重12%
  policy_notes_md           text,
  climate_cooling_score     integer,       -- 1-5,权重8%
  climate_cooling_notes_md  text,
  risk_score                integer,       -- 1-5,权重5%
  risk_notes_md             text,

  overall_score             numeric,       -- 程序按固定权重计算的加权总分(0-100),不由AI计算
  fit_verdict               text check (fit_verdict in ('strong_fit', 'partial_fit', 'weak_fit', 'insufficient_data')),
  source_urls               text[] not null default '{}'
);
create index if not exists idx_sea_deals_date on sea_deals (report_date);
create index if not exists idx_sea_deals_country on sea_deals (country_code, report_date);

alter table sea_countries enable row level security;
alter table sea_country_outlook enable row level security;
alter table sea_deals enable row level security;

create policy "public read sea_countries" on sea_countries for select using (true);
create policy "public read sea_country_outlook" on sea_country_outlook for select using (true);
create policy "public read sea_deals" on sea_deals for select using (true);

-- Phase 4: 我的持仓量化监控与买卖预警 -- 数据库 schema
-- 在 Supabase 项目的 SQL Editor 里执行一次(在 schema.sql / schema_sea.sql / schema_trend.sql 之后执行)

-- 持仓清单:和 pipeline/portfolioHoldings.ts 保持一致,增删持仓时两边都要改。
-- shares / cost_basis 可以为 null(只想监控信号、不想录入仓位时)。
create table if not exists portfolio_holdings (
  ticker       text primary key,
  company_name text not null,
  shares       numeric,
  cost_basis   numeric,          -- 每股成本(美元)
  active       boolean not null default true
);

insert into portfolio_holdings (ticker, company_name, shares, cost_basis) values
  ('NVDA', 'NVIDIA', 40, 950),
  ('MSFT', 'Microsoft', 30, 420),
  ('AAPL', 'Apple', 50, 190),
  ('AMZN', 'Amazon', 30, 180),
  ('TSLA', 'Tesla', 20, 250)
on conflict (ticker) do nothing;

-- 每天每支持仓一行:程序按固定规则计算出的量化信号(不经过AI)
create table if not exists portfolio_signal (
  id              uuid primary key default gen_random_uuid(),
  report_date     date not null,
  ticker          text not null references portfolio_holdings(ticker),
  price           numeric,
  change_pct_1d   numeric,
  relative_volume numeric,
  sma50           numeric,
  sma200          numeric,
  trend_state     text check (trend_state in ('above_200', 'below_200', 'unknown')),
  momentum_12_1   numeric,          -- 12-1月动量(过去252个交易日剔除最近21个交易日的涨跌幅,%)
  momentum_rank   integer,          -- 当日在全部持仓中的动量排名,1=最强
  rsi14           numeric,
  drawdown_pct    numeric,          -- 相对52周最高收盘价的回撤(负数,%)
  action          text not null check (action in ('hold', 'add', 'trim', 'sell', 'watch')),
  action_reasons  text[] not null default '{}',
  alert_flag      boolean not null default false,   -- 触发任何买卖/风险信号
  unique (report_date, ticker)
);
create index if not exists idx_portfolio_signal_date on portfolio_signal (report_date);

-- 每天一行:组合层面汇总 + Claude 点评
create table if not exists portfolio_snapshot (
  id             uuid primary key default gen_random_uuid(),
  report_date    date not null unique,
  total_alerts   integer not null default 0,
  commentary_md  text,             -- Claude 对当日信号的整体解读
  rotation_md    text,             -- Claude 对动量轮动建议的解读
  email_sent     boolean not null default false
);

-- 回测结果:每支持仓 x 每个策略一行,流水线定期刷新
create table if not exists portfolio_backtest (
  id             uuid primary key default gen_random_uuid(),
  ticker         text not null,    -- 个股代码,或 'PORTFOLIO'(组合层面的动量轮动回测)
  strategy       text not null,    -- 'buy_hold' | 'trend_200' | 'momentum_rotation'
  start_date     date not null,
  end_date       date not null,
  cagr_pct       numeric,          -- 年化收益率 %
  max_drawdown_pct numeric,        -- 最大回撤 %(负数)
  volatility_pct numeric,          -- 年化波动率 %
  sharpe         numeric,          -- 夏普比率(无风险利率按0)
  trade_count    integer,          -- 策略产生的换仓次数(买入持有为0)
  updated_at     timestamptz not null default now(),
  unique (ticker, strategy)
);

alter table portfolio_holdings enable row level security;
alter table portfolio_signal enable row level security;
alter table portfolio_snapshot enable row level security;
alter table portfolio_backtest enable row level security;

create policy "public read portfolio_holdings" on portfolio_holdings for select using (true);
create policy "public read portfolio_signal" on portfolio_signal for select using (true);
create policy "public read portfolio_snapshot" on portfolio_snapshot for select using (true);
create policy "public read portfolio_backtest" on portfolio_backtest for select using (true);

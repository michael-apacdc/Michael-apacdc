# 全球数据中心行业趋势与投资分析

每天自动抓取新闻和金融数据、用 Claude 生成分析报告、发布到一个团队可访问的网页。本文档是给非开发者看的操作手册。

## 这是什么

- 每天(北京时间上午9点左右)GitHub Actions 自动依次运行三条流水线:
  1. **行业日报**:抓新闻 → 用 Claude 生成结构化分析报告(新闻摘要、亚太投资动态、地缘政治、行业趋势、竞争态势)→ 存进数据库 → 网页展示。
  2. **亚太选址分析**:抓新加坡/马来西亚/泰国/印尼/日本/澳大利亚/韩国的数据中心拿地/电力协议新闻 → 按六维度选址框架(电力38%/连接22%/土地工程15%/税收政策12%/气候水资源8%/风险5%)打分 → 生成七国投资热度排名。
  3. **美股趋势研判与预警**:跟踪AI产业链6个细分行业(芯片/光模块/数据中心/存储/液冷/能源)的代表个股,从 Yahoo Finance 公开图表接口抓取价格与成交量信号(免费、无需key),程序按固定规则检测异常波动,再由 Claude 结合细分行业新闻给出方向性研判。
- 另有一个**量化分析**页面(`/quant`)是实时工具,不在每日自动化里:输入任意美股代码,现场用 Piotroski F-Score 和 Altman Z-Score 两个公开经典量化模型算分,不经过AI、纯数学计算。财报数据来自 **SEC EDGAR**(美国证监会官方免费公开数据,不需要key、无覆盖限制),股价来自 Yahoo Finance。
- 网页页面:今日报告(`/`)、历史归档(`/archive`)、亚太选址分析(`/sea`)、量化分析(`/quant`)、美股趋势研判与预警(`/trend`)。
- 不需要登录 —— 谁拿到网页链接谁就能看,适合内部分享给团队,但请注意"链接可访问"不等于"私密",不要把链接发到公开渠道。

## 账号注册清单(第一次搭建时,按顺序做)

1. **GitHub**(github.com)—— 免费账号,存代码 + 跑每日自动化任务。
2. 新建一个仓库(公开或私有都行,公开的话自动化不受免费分钟数限制)。
3. **Anthropic Console**(console.anthropic.com)—— 注册后去 Billing 绑定支付方式并预充值(建议先充 $10-20),再去 API Keys 页面生成一个 key。**这是唯一有实质持续费用的一环**。流水线用的是 Claude Haiku 4.5($1/百万输入token,$5/百万输出token),预计每月大概 $5-15(取决于当天新闻量)。
4. **Supabase**(supabase.com)—— 可以用 GitHub 账号登录,新建一个免费项目。进项目设置的 API 页面,拿到:
   - Project URL
   - `anon` `public` key(公开可用)
   - `service_role` key(**机密**,只用在流水线,不要给前端用)
5. 在 Supabase 项目的 SQL Editor 里,依次执行 [`supabase/schema.sql`](supabase/schema.sql)、[`supabase/schema_sea.sql`](supabase/schema_sea.sql)、[`supabase/schema_trend.sql`](supabase/schema_trend.sql) 的内容,建好全部数据表。
6. **Vercel**(vercel.com)—— 用 GitHub 账号登录,导入这个仓库作为新项目,会自动部署网页。

不需要注册任何金融数据API —— 股价来自 Yahoo Finance,财报数据来自 SEC EDGAR,都是免费公开接口,不需要key。

## 配置密钥(两个地方)

**GitHub 仓库 → Settings → Secrets and variables → Actions**,添加3个 Secret(供每日自动化流水线使用):

- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

**Vercel 项目 → Settings → Environment Variables**,添加2个变量(供网页读取数据使用,注意不要把 `service_role` key 放这里):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## 本地测试流水线(建议先在这一步确认没问题,再交给自动化)

```bash
npm install
cp pipeline/.env.example .env   # 然后把 .env 里的占位符换成真实的 key
npm run pipeline                 # 行业日报,等同于 npx tsx pipeline/run.ts
npm run pipeline:sea             # 亚太选址分析,等同于 npx tsx pipeline/runSea.ts
npm run pipeline:trend           # 美股趋势研判与预警,等同于 npx tsx pipeline/runTrend.ts
```

运行时会打印每一步的进度,最后会打印本次预估花费。运行完可以去 Supabase 的 Table Editor 里检查对应的表是否有新数据(`daily_reports`/`news_items`/`trend_notes`、`sea_deals`/`sea_country_outlook`、`trend_ticker_signal`/`trend_subsector_snapshot`)。

## 手动触发一次真实的自动化任务(不用等到第二天早上)

推送代码、配置好 Secrets 后,去 GitHub 仓库的 **Actions** 标签页,找到 "Daily Data Center Report Pipeline",点击 **Run workflow** 按钮即可手动跑一次,不需要碰终端。

## 日常维护

- **想增删跟踪的个股**:改 `pipeline/trendTickers.ts`(以及可选地在 Supabase 的 `trend_tickers` 表里加一行),推送到 GitHub 即可,下次自动运行会生效。
- **想改运行时间**:改 `.github/workflows/daily-pipeline.yml` 里的 `cron` 表达式(当前是 `5 1 * * *`,即 UTC 01:05 = 北京时间上午9:05)。
- **`keepalive.yml` 是干什么的**:GitHub 会在仓库连续60天无提交时自动停用定时任务,这个工作流每月自动提交一次空提交来防止被停用,不需要手动管理。
- **报告状态是 "partial"**:说明当天有部分新闻源抓取失败,报告仍会生成但可能不完整,可以查看 `daily_reports.raw_pipeline_meta` 字段里的 `warnings` 排查原因。
- **量化分析(`/quant`)查询失败**:如果提示"在 SEC EDGAR 里找不到股票代码",说明这不是美股上市公司(SEC EDGAR 只覆盖在美国交易所上市、需要向SEC报送财报的公司);如果提示"历史财报数据不足两个财年",可能是刚上市不久的公司。

## 技术栈(供参考)

Next.js(网页) + Supabase Postgres(数据库)+ GitHub Actions(每日定时任务)+ Yahoo Finance(股价数据)+ SEC EDGAR(官方财报数据)+ Anthropic Claude API(模型:claude-haiku-4-5,分析生成),部署在 Vercel。托管/数据库/调度/新闻/股价/财报数据全部免费,唯一持续成本是 Claude API 调用(Haiku 4.5 定价下预计每月几美元到十几美元)。

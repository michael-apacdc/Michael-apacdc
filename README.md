# 全球数据中心行业趋势与投资分析

每天自动抓取新闻和金融数据、用 Claude 生成分析报告、发布到一个团队可访问的网页。本文档是给非开发者看的操作手册。

## 这是什么

- 每天(北京时间上午9点左右)自动运行一次:抓新闻 → 抓个股金融数据 → 用 Claude 生成结构化分析报告 → 存进数据库 → 网页自动展示。
- 网页有4类页面:今日报告(`/`)、历史归档(`/archive`)、单只股票的历史趋势图(`/ticker/NVDA` 等)。
- 不需要登录 —— 谁拿到网页链接谁就能看,适合内部分享给团队,但请注意"链接可访问"不等于"私密",不要把链接发到公开渠道。

## 账号注册清单(第一次搭建时,按顺序做)

1. **GitHub**(github.com)—— 免费账号,存代码 + 跑每日自动化任务。
2. 新建一个仓库(公开或私有都行,公开的话自动化不受免费分钟数限制)。
3. **Anthropic Console**(console.anthropic.com)—— 注册后去 Billing 绑定支付方式并预充值(建议先充 $20),再去 API Keys 页面生成一个 key。**这是唯一有实质持续费用的一环**,预计每月 $20-60,取决于报告长度和跟踪个股数量。
4. **Financial Modeling Prep**(financialmodelingprep.com)—— 注册免费版,拿 API key。免费版限 250次请求/天,目前19支跟踪个股够用。
5. **Supabase**(supabase.com)—— 可以用 GitHub 账号登录,新建一个免费项目。进项目设置的 API 页面,拿到:
   - Project URL
   - `anon` `public` key(公开可用)
   - `service_role` key(**机密**,只用在流水线,不要给前端用)
6. 在 Supabase 项目的 SQL Editor 里,把 [`supabase/schema.sql`](supabase/schema.sql) 的内容粘贴进去执行一次,建好全部数据表。
7. **Vercel**(vercel.com)—— 用 GitHub 账号登录,导入这个仓库作为新项目,会自动部署网页。

## 配置密钥(两个地方)

**GitHub 仓库 → Settings → Secrets and variables → Actions**,添加4个 Secret(供每日自动化流水线使用):

- `ANTHROPIC_API_KEY`
- `FMP_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

**Vercel 项目 → Settings → Environment Variables**,添加2个变量(供网页读取数据使用,注意不要把 `service_role` key 放这里):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## 本地测试流水线(建议先在这一步确认没问题,再交给自动化)

```bash
npm install
cp pipeline/.env.example .env   # 然后把 .env 里的占位符换成真实的 key
npm run pipeline                 # 等同于 npx tsx pipeline/run.ts
```

运行时会打印每一步的进度(抓新闻、抓金融数据、调用 Claude、写数据库),最后会打印本次预估花费。运行完可以去 Supabase 的 Table Editor 里检查 `daily_reports` / `stock_picks` / `news_items` / `trend_notes` 这几张表是否有新数据。

## 手动触发一次真实的自动化任务(不用等到第二天早上)

推送代码、配置好4个 Secrets 后,去 GitHub 仓库的 **Actions** 标签页,找到 "Daily Data Center Report Pipeline",点击 **Run workflow** 按钮即可手动跑一次,不需要碰终端。

## 日常维护

- **想增删跟踪的个股**:改 `pipeline/tickers.json`(以及可选地在 Supabase 的 `tracked_tickers` 表里加一行),推送到 GitHub 即可,下次自动运行会生效。
- **想改运行时间**:改 `.github/workflows/daily-pipeline.yml` 里的 `cron` 表达式(当前是 `5 1 * * *`,即 UTC 01:05 = 北京时间上午9:05)。
- **`keepalive.yml` 是干什么的**:GitHub 会在仓库连续60天无提交时自动停用定时任务,这个工作流每月自动提交一次空提交来防止被停用,不需要手动管理。
- **报告状态是 "partial"**:说明当天有部分新闻源或金融数据源抓取失败,报告仍会生成但可能不完整,可以查看 `daily_reports.raw_pipeline_meta` 字段里的 `warnings` 排查原因。

## 技术栈(供参考)

Next.js(网页) + Supabase Postgres(数据库)+ GitHub Actions(每日定时任务)+ Financial Modeling Prep(金融数据)+ Anthropic Claude API(分析生成),部署在 Vercel。托管/数据库/调度/新闻抓取全部免费,唯一持续成本是 Claude API 调用。

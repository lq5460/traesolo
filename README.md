# News Demo - 免费公网部署一键指南

## 一句话目标
- 前端（Next.js）部署到 Vercel 免费层
- 后端（Express API）部署到 Render 免费层
- 数据库用 Neon/Supabase 免费层
- Redis 用 Upstash 免费层
- 不启用队列与 Worker，功能完整可用

## 快速目录
- 部署前准备
- 数据与缓存创建（Neon/Supabase、Upstash）
- 部署 API（Render Blueprint）
- 部署 Web（Vercel）
- 验证与导入数据
- 可观测与压测
- 常见问题与排错

## 部署前准备
1. 将代码推送到 GitHub（或你使用的 Git 平台）
2. 仓库内已提供：
   - `vercel.json`：Vercel 构建 `apps/web`
   - `render.yaml`：Render Blueprint 部署 `apps/api`
   - 环境变量占位：`apps/api/.env.example`、`apps/web/.env.example`

## 数据与缓存创建
### PostgreSQL（Neon 或 Supabase）
- 创建数据库，记录：`POSTGRES_HOST/PORT/USER/PASSWORD/DB`
- 免费层默认提供公网访问

### Redis（Upstash）
- 新建 Redis，复制 `REDIS_URL`（形如 `rediss://:password@host:port`）

## 部署 API（Render 免费层）
方式一（推荐）：使用 Blueprint
- 打开 Render → New Blueprint → 选择你的仓库 → 自动识别 `render.yaml`
- 创建 Secrets 并绑定到 `news-api` 服务：
  - `POSTGRES_HOST`
  - `POSTGRES_PORT`
  - `POSTGRES_USER`
  - `POSTGRES_PASSWORD`
  - `POSTGRES_DB`
  - `REDIS_URL`（Upstash 提供）
  - `PORT=3000`
- 部署完成后，访问 `https://<api-domain>/health` 应返回 `{ "ok": true }`

方式二：手动创建 Web Service
- Root Dir：`apps/api`
- Build：`npm install --no-audit --no-fund`
- Start：`node server.js`
- Health Check Path：`/health`
- 环境变量同上

## 部署 Web（Vercel 免费层）
- 在 Vercel 导入仓库，root 选择 `apps/web`
- 设置环境变量：
  - `NEXT_PUBLIC_API_BASE=https://<api-domain>/api`
  - `API_INTERNAL_BASE=https://<api-domain>/api`
  - `NODE_ENV=production`
- 部署完成后访问 `https://<web-domain>/`

## 验证与导入数据
- 首页：`https://<web-domain>/`（会 307 到 `/?category=all&page=1&v=1`）
- 导入样例数据（可选）：
  - `curl -X POST 'https://<api-domain>/api/seed?count=50'`
- 分类列表：`https://<api-domain>/api/categories`
- 文章列表：`https://<api-domain>/api/articles?category=all&page=1`
- 分类页：`https://<web-domain>/?category=微服务&page=1&v=1`
- 详情页：`https://<web-domain>/articles/<id>?v=1`

## 可观测与压测
- API 指标：
  - `https://<api-domain>/api/stats`（JSON）
  - `https://<api-domain>/api/metrics`（文本）
- 图表页（实时柱状图 + 一键压测）：
  - `https://<web-domain>/charts`
- 压测接口（后端触发）：
  - `https://<api-domain>/api/load?total=500&concurrency=50`

## 常见问题与排错
- 502 或 404：确认 API 域名已在 Web 的 `NEXT_PUBLIC_API_BASE/API_INTERNAL_BASE` 中正确设置
- Redis 未连接：请使用 `REDIS_URL`（TLS 连接串），API 已优先读取该变量
- 读写分离：免费层通常不提供副本，`READ_POSTGRES_*` 与主库一致即可
- 异步与快照：不设置 `KAFKA_BROKER` 即关闭；网站功能完整不受影响

## 本地开发
- 本地容器：`docker compose up -d`
- Web：`cd apps/web && npx next dev`
- API：`cd apps/api && node server.js`

## 目录与关键文件
- `apps/web/pages/charts.js`：图表页（压测与指标可视化）
- `apps/api/server.js`：API 服务，含 `/api/stats` `/api/metrics` `/api/load`
- `vercel.json`：Vercel 构建配置
- `render.yaml`：Render Blueprint 配置
- `apps/api/.env.example`、`apps/web/.env.example`：环境变量模板

---
如需进一步“一键”体验（包含创建 Neon/Upstash 并自动注入变量），可在后续版本加入 GitHub Actions 工作流与 Terraform 脚本。我可以按你的云账户继续完善自动化脚本。

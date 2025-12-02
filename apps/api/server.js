const express = require('express')
const { Pool } = require('pg')
const { createClient } = require('redis')
const fs = require('fs')
const path = require('path')
const { Kafka } = require('kafkajs')

const PORT = process.env.PORT || 3000

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER || 'app',
  password: process.env.POSTGRES_PASSWORD || 'app',
  database: process.env.POSTGRES_DB || 'news'
})

const readPool = new Pool({
  host: process.env.READ_POSTGRES_HOST || process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.READ_POSTGRES_PORT || process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER || 'app',
  password: process.env.POSTGRES_PASSWORD || 'app',
  database: process.env.POSTGRES_DB || 'news'
})

const redis = createClient({
  url: process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
})

const app = express()
app.use(express.json())

const metrics = {
  total: 0,
  errors: 0,
  routes: {},
  latency: { lt50: 0, lt100: 0, lt200: 0, lt500: 0, gte500: 0 }
}

app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const d = Date.now() - start
    metrics.total++
    if (res.statusCode >= 500) metrics.errors++
    const p = (req.route && req.route.path) || req.path || 'unknown'
    metrics.routes[p] = (metrics.routes[p] || 0) + 1
    if (d < 50) metrics.latency.lt50++
    else if (d < 100) metrics.latency.lt100++
    else if (d < 200) metrics.latency.lt200++
    else if (d < 500) metrics.latency.lt500++
    else metrics.latency.gte500++
  })
  next()
})

let redisReady = false
async function connectRedisWithRetry(retries = 10, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      await redis.connect()
      redisReady = true
      return
    } catch (e) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  redisReady = false
}

async function init() {
  await connectRedisWithRetry().catch(() => {})
  async function connectPgWithRetry(retries = 20, delayMs = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        await pool.query('SELECT 1')
        return
      } catch (e) {
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
    throw new Error('postgres_connect_failed')
  }
  await connectPgWithRetry().catch(() => {})
  async function connectPgReadWithRetry(retries = 30, delayMs = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        await readPool.query('SELECT 1')
        return
      } catch (e) {
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
  }
  await connectPgReadWithRetry().catch(() => {})
  try {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS articles (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT,
      content TEXT,
      published_at TIMESTAMP DEFAULT NOW()
    );
  `)
    await pool.query('ALTER TABLE articles ADD COLUMN IF NOT EXISTS category TEXT')
    await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm')
    await pool.query('CREATE INDEX IF NOT EXISTS idx_articles_category_published_at ON articles (category, published_at DESC)')
    await pool.query('CREATE INDEX IF NOT EXISTS idx_articles_trgm_title ON articles USING gin (title gin_trgm_ops)')
    await pool.query('CREATE INDEX IF NOT EXISTS idx_articles_trgm_summary ON articles USING gin (summary gin_trgm_ops)')
    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM articles')
    if (rows[0].count < 18) {
      const samples = [
        ['欢迎使用资讯网站','这是一个示例文章，展示基本功能','从0到百万用户的系统设计实践：分层、缓存、读写分离与异步化。','推荐'],
        ['系统设计：缓存优先','解释多级缓存（边缘、应用、本地）如何协同','命中率目标 > 80%，失效策略与空值缓存避免击穿','架构'],
        ['数据库读写分离','一主多从的读写策略','强一致读走主库，索引优化与慢查询治理','数据库'],
        ['消息队列与异步化','引入 Kafka 处理索引刷新与统计','离线任务与重试机制，削峰填谷','中间件'],
        ['搜索与推荐基础','OpenSearch 检索与热门/主题推荐','点击/停留/互动信号驱动排序与多样性','搜索'],
        ['边缘缓存与静态化','热门频道/详情短 TTL 与静态化输出','发布逐步失效，防止失效风暴','缓存'],
        ['前后端分层','Web SSR 与 API REST 的职责划分','独立扩容与安全边界管理','前端'],
        ['容器化与网络','统一网络服务发现与端口管理','Compose 编排与未来向 K8s 迁移','容器'],
        ['可观测性建设','指标、日志、追踪与告警','容量压测与瓶颈定位实践','SRE'],
        ['安全与合规','WAF、RBAC、隐私与审计','输入校验与速率限制、防爬策略','安全'],
        ['云原生实践','K8s 与服务网格治理','声明式配置与自动化运维','云原生'],
        ['DevOps 流水线','CI/CD 与发布机制','金丝雀与自动回滚、版本治理','DevOps'],
        ['微服务拆分','边界划分与治理模型','限流熔断与服务发现','微服务'],
        ['数据工程','数据采集、清洗与ETL','批流一体与数据湖','数据工程'],
        ['AI 应用','Embedding 与推荐融合','模型上线与监控','AI应用'],
        ['性能优化','Profile 与热点治理','资源压测与容量规划','性能优化'],
        ['测试与质量','单元/集成/端到端测试','可用性与可靠性度量','测试质量'],
        ['产品与运营','ABTest 与漏斗分析','增长与留存指标体系','产品运营']
      ]
      for (const [t, s, c, cat] of samples) {
        await pool.query('INSERT INTO articles (title, summary, content, category) VALUES ($1, $2, $3, $4)', [t, s, c, cat])
      }
    }
  } catch (e) {}

  try {
    const kafkaBroker = process.env.KAFKA_BROKER || ''
    if (kafkaBroker) {
      const kafka = new Kafka({ brokers: [kafkaBroker] })
      const admin = kafka.admin()
      await admin.connect()
      await admin.createTopics({ topics: [
        { topic: 'article_published', numPartitions: 1, replicationFactor: 1 },
        { topic: 'article_viewed', numPartitions: 1, replicationFactor: 1 },
        { topic: 'home_snapshot', numPartitions: 1, replicationFactor: 1 }
      ], waitForLeaders: true })
      await admin.disconnect()
      app.locals.kafka = kafka
    }
  } catch (_) {}
}

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    if (redisReady) {
      await redis.ping()
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

app.get('/api/stats', (req, res) => {
  res.json(metrics)
})
app.get('/api/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain')
  const lines = []
  lines.push(`requests_total ${metrics.total}`)
  lines.push(`errors_total ${metrics.errors}`)
  lines.push(`latency_bucket{le="50"} ${metrics.latency.lt50}`)
  lines.push(`latency_bucket{le="100"} ${metrics.latency.lt100}`)
  lines.push(`latency_bucket{le="200"} ${metrics.latency.lt200}`)
  lines.push(`latency_bucket{le="500"} ${metrics.latency.lt500}`)
  lines.push(`latency_bucket{le="+Inf"} ${metrics.latency.gte500}`)
  for (const [route, count] of Object.entries(metrics.routes)) {
    lines.push(`route_requests_total{route="${route}"} ${count}`)
  }
  res.send(lines.join('\n'))
})

app.get('/api/load', async (req, res) => {
  try {
    const total = Math.max(1, Math.min(5000, parseInt(req.query.total || '200', 10)))
    const concurrency = Math.max(1, Math.min(200, parseInt(req.query.concurrency || '20', 10)))
    const base = process.env.LOAD_BASE || 'http://nginx'
    const cats = ['架构','微服务','数据库','前端','推荐']
    function pickPath() {
      const r = Math.random()
      if (r < 0.4) return '/?category=all&page=1&v=1'
      if (r < 0.7) return `/?category=${encodeURIComponent(cats[Math.floor(Math.random()*cats.length)])}&page=1&v=1`
      if (r < 0.9) return '/api/articles?category=all&page=1'
      return '/api/categories'
    }
    async function hit(p) {
      const t0 = Date.now()
      const resp = await fetch(base + p)
      const t1 = Date.now()
      return { ok: resp.ok, status: resp.status, ms: t1 - t0, path: p }
    }
    const tasks = new Array(total).fill(0).map(() => () => hit(pickPath()))
    const results = []
    let idx = 0
    async function worker() {
      while (idx < tasks.length) {
        const t = tasks[idx++]
        try { results.push(await t()) } catch { results.push({ ok: false, status: 0, ms: 0, path: 'error' }) }
      }
    }
    await Promise.all(new Array(concurrency).fill(0).map(() => worker()))
    const times = results.map(r => r.ms).sort((a,b)=>a-b)
    const ok = results.filter(r => r.ok).length
    const p = (x) => times[Math.floor(times.length*x)] || 0
    const summary = {
      total: results.length,
      ok,
      avg: Math.round(times.reduce((a,b)=>a+b,0)/(times.length||1)),
      p50: p(0.5), p90: p(0.9), p95: p(0.95), p99: p(0.99), max: times[times.length-1] || 0
    }
    res.json({ base, concurrency, summary })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

app.get('/version/list', async (req, res) => {
  try {
    let v = '1'
    if (redisReady) {
      v = (await redis.get('list_version')) || '1'
    }
    res.json({ version: v })
  } catch (e) {
    res.json({ version: '1' })
  }
})
app.get('/api/version/list', async (req, res) => {
  try {
    let v = '1'
    if (redisReady) {
      v = (await redis.get('list_version')) || '1'
    }
    res.json({ version: v })
  } catch (e) {
    res.json({ version: '1' })
  }
})

async function listHandler(req, res) {
  try {
    const category = (req.query.category || 'all').toString()
    const page = Math.max(1, parseInt(req.query.page || '1', 10))
    const pageSize = Math.max(1, Math.min(20, parseInt(req.query.pageSize || '10', 10)))
    let v = '1'
    if (redisReady) v = (await redis.get('list_version')) || '1'
    const cacheKey = `list:${category}:page:${page}:size:${pageSize}:v:${v}`
    if (redisReady) {
      const cached = await redis.get(cacheKey)
      if (cached) return res.json(JSON.parse(cached))
    }
    const offset = (page - 1) * pageSize
    let rows
    let source = 'replica'
    try {
      if (category === 'all') {
        rows = (await readPool.query(
          'SELECT id, title, summary, category, published_at FROM articles ORDER BY published_at DESC LIMIT $1 OFFSET $2',
          [pageSize, offset]
        )).rows
      } else {
        rows = (await readPool.query(
          'SELECT id, title, summary, category, published_at FROM articles WHERE category = $1 ORDER BY published_at DESC LIMIT $2 OFFSET $3',
          [category, pageSize, offset]
        )).rows
      }
    } catch (_e) {
      source = 'primary'
      if (category === 'all') {
        rows = (await pool.query(
          'SELECT id, title, summary, category, published_at FROM articles ORDER BY published_at DESC LIMIT $1 OFFSET $2',
          [pageSize, offset]
        )).rows
      } else {
        rows = (await pool.query(
          'SELECT id, title, summary, category, published_at FROM articles WHERE category = $1 ORDER BY published_at DESC LIMIT $2 OFFSET $3',
          [category, pageSize, offset]
        )).rows
      }
    }
    if (redisReady) await redis.set(cacheKey, JSON.stringify(rows), { EX: 60 })
    res.set('X-DB-Source', source)
    res.json(rows)
  } catch (e) {
    res.set('X-DB-Source', 'fallback')
    res.json([
      {
        id: 1,
        title: '欢迎使用资讯网站',
        summary: '这是一个示例文章，展示基本功能',
        published_at: new Date().toISOString()
      }
    ])
  }
}
app.get('/articles', listHandler)
app.get('/api/articles', listHandler)
 

async function detailHandler(req, res) {
  try {
    const cacheKey = `article:${req.params.id}`
    if (redisReady) {
      const cached = await redis.get(cacheKey)
      if (cached) return res.json(JSON.parse(cached))
    }
    let rows
    let source = 'replica'
    try {
      rows = (await readPool.query('SELECT * FROM articles WHERE id = $1', [req.params.id])).rows
    } catch (_e) {
      source = 'primary'
      rows = (await pool.query('SELECT * FROM articles WHERE id = $1', [req.params.id])).rows
    }
    if (rows.length === 0) return res.status(404).json({ error: 'not_found' })
    if (redisReady) await redis.set(cacheKey, JSON.stringify(rows[0]), { EX: 120 })
    res.set('X-DB-Source', source)
    res.json(rows[0])
  } catch (e) {
    res.set('X-DB-Source', 'fallback')
    res.json({
      id: Number(req.params.id) || 1,
      title: '欢迎使用资讯网站',
      summary: '这是一个示例文章，展示基本功能',
      content: '从0到百万用户的系统设计实践：分层、缓存、读写分离与异步化。',
      published_at: new Date().toISOString()
    })
  }
}
app.get('/articles/:id', detailHandler)
app.get('/api/articles/:id', detailHandler)

async function createArticleHandler(req, res) {
  try {
    const { title, summary, content } = req.body || {}
    if (!title) return res.status(400).json({ error: 'title_required' })
    const { rows } = await pool.query(
      'INSERT INTO articles (title, summary, content) VALUES ($1, $2, $3) RETURNING id',
      [title, summary || null, content || null]
    )
    if (redisReady) {
      await redis.incr('list_version')
    }
    if (app.locals.kafka) {
      const producer = app.locals.kafka.producer()
      await producer.connect()
      await producer.send({ topic: 'article_published', messages: [{ value: JSON.stringify({ id: rows[0].id }) }] })
      await producer.send({ topic: 'home_snapshot', messages: [{ value: JSON.stringify({ reason: 'article_published' }) }] })
      await producer.disconnect()
    }
    res.status(201).json({ id: rows[0].id })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
}
app.post('/articles', createArticleHandler)
app.post('/api/articles', createArticleHandler)

app.post('/api/track/view/:id', async (req, res) => {
  try {
    const id = String(req.params.id)
    if (app.locals.kafka) {
      const producer = app.locals.kafka.producer()
      await producer.connect()
      await producer.send({ topic: 'article_viewed', messages: [{ value: JSON.stringify({ id }) }] })
      await producer.disconnect()
    }
    if (redisReady) {
      await redis.zIncrBy('article_views', 1, id)
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false })
  }
})


async function categoriesHandler(req, res) {
  try {
    if (redisReady) {
      const cached = await redis.get('categories')
      if (cached) return res.json(JSON.parse(cached))
    }
    let rows
    let source = 'replica'
    try {
      rows = (await readPool.query('SELECT DISTINCT category FROM articles WHERE category IS NOT NULL ORDER BY category ASC')).rows
    } catch (_e) {
      source = 'primary'
      rows = (await pool.query('SELECT DISTINCT category FROM articles WHERE category IS NOT NULL ORDER BY category ASC')).rows
    }
    const cats = rows.map(r => r.category)
    if (redisReady) await redis.set('categories', JSON.stringify(cats), { EX: 600 })
    res.set('X-DB-Source', source)
    res.json(cats)
  } catch (e) {
    res.set('X-DB-Source', 'fallback')
    res.json(['推荐','架构','数据库','中间件','搜索','缓存','前端','容器','SRE','安全','云原生','DevOps','微服务','数据工程','AI应用','性能优化','测试质量','产品运营'])
  }
}
app.get('/categories', categoriesHandler)
app.get('/api/categories', categoriesHandler)

async function seedHandler(req, res) {
  try {
    const count = Math.max(1, Math.min(500, parseInt((req.query.count || '50'), 10)))
    const cats = (req.query.categories ? String(req.query.categories).split(',') : [
      '推荐','架构','数据库','中间件','搜索','缓存','前端','容器','SRE','安全','云原生','DevOps','微服务','数据工程','AI应用','性能优化','测试质量','产品运营','日志','监控','告警','物联网','边缘计算','区块链','多云','混合云','数据治理','数据可视化','NLP','CV','推荐系统','灰度发布','A/B测试'
    ])
    for (let i = 0; i < count; i++) {
      const cat = cats[i % cats.length]
      const t = `${cat} 专题 ${Date.now()}-${i}`
      const s = `${cat} 主题的实践与最佳实践`
      const c = `${cat} 相关内容，覆盖架构、性能、可观测与运维等方面。`
      await pool.query('INSERT INTO articles (title, summary, content, category) VALUES ($1, $2, $3, $4)', [t, s, c, cat])
    }
    if (redisReady) {
      await redis.incr('list_version')
      await redis.del('categories')
    }
    if (app.locals.kafka) {
      try {
        const producer = app.locals.kafka.producer()
        await producer.connect()
        await producer.send({ topic: 'home_snapshot', messages: [{ value: JSON.stringify({ reason: 'seed' }) }] })
        await producer.disconnect()
      } catch (_) {}
    }
    res.json({ inserted: count, categories: cats.length })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
}
app.post('/api/seed', seedHandler)
app.post('/seed', seedHandler)

async function feedsHomeHandler(req, res) {
  try {
    let v = '1'
    if (redisReady) v = (await redis.get('list_version')) || '1'
    const cacheKey = `feed:home:v:${v}`
    if (redisReady) {
      const cached = await redis.get(cacheKey)
      if (cached) {
        res.set('X-DB-Source', 'replica')
        return res.json(JSON.parse(cached))
      }
    }
    let source = 'replica'
    let catsRows
    try {
      catsRows = (await readPool.query('SELECT DISTINCT category FROM articles WHERE category IS NOT NULL ORDER BY category ASC LIMIT 8')).rows
    } catch (_e) {
      source = 'primary'
      catsRows = (await pool.query('SELECT DISTINCT category FROM articles WHERE category IS NOT NULL ORDER BY category ASC LIMIT 8')).rows
    }
    const cats = catsRows.map(r => r.category)
    const sections = []
    for (const c of cats) {
      let rows
      if (source === 'replica') {
        rows = (await readPool.query('SELECT id, title, summary, category, published_at FROM articles WHERE category = $1 ORDER BY published_at DESC LIMIT 5', [c])).rows
      } else {
        rows = (await pool.query('SELECT id, title, summary, category, published_at FROM articles WHERE category = $1 ORDER BY published_at DESC LIMIT 5', [c])).rows
      }
      sections.push({ category: c, items: rows })
    }
    let latest
    if (source === 'replica') {
      latest = (await readPool.query('SELECT id, title, summary, category, published_at FROM articles ORDER BY published_at DESC LIMIT 20')).rows
    } else {
      latest = (await pool.query('SELECT id, title, summary, category, published_at FROM articles ORDER BY published_at DESC LIMIT 20')).rows
    }
    const payload = { latest, sections }
    if (redisReady) await redis.set(cacheKey, JSON.stringify(payload), { EX: 60 })
    res.set('X-DB-Source', source)
    res.json(payload)
  } catch (e) {
    res.set('X-DB-Source', 'fallback')
    res.json({ latest: [
      { id: 1, title: '欢迎使用资讯网站', summary: '这是一个示例文章，展示基本功能', category: '推荐', published_at: new Date().toISOString() }
    ], sections: [] })
  }
}
app.get('/feeds/home', feedsHomeHandler)
app.get('/api/feeds/home', feedsHomeHandler)

async function snapshotArticle(id) {
  const base = process.env.SNAPSHOT_FETCH_BASE || 'http://nginx'
  // fetch SSR HTML with version and nocache to avoid edge cache
  let v = '1'
  try {
    const vRes = await fetch(`${base}/api/version/list`)
    const vJson = await vRes.json()
    v = vJson.version || '1'
  } catch {}
  const url = `${base}/articles/${id}?v=${v}&nocache=1&ts=${Date.now()}`
  const res = await fetch(url)
  const html = await res.text()
  const dir = path.join('/data/snapshots', 'articles')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${id}.html`), html)
  return { id, bytes: Buffer.byteLength(html) }
}

app.post('/api/snapshot/articles/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '1')
    const r = await snapshotArticle(id)
    res.json({ ok: true, snapshot: r })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

app.delete('/api/snapshot/articles/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '1')
    const file = path.join('/var/snapshots', 'articles', `${id}.html`)
    if (fs.existsSync(file)) fs.unlinkSync(file)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

init()
  .catch(() => {})
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`API listening on :${PORT}`)
    })
  })
app.get('/api/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const page = Math.max(1, parseInt(req.query.page || '1', 10))
    const pageSize = Math.max(1, Math.min(20, parseInt(req.query.pageSize || '10', 10)))
    if (!q) return res.json([])
    const offset = (page - 1) * pageSize
    let rows
    let source = 'replica'
    try {
      rows = (await readPool.query(
        "SELECT id, title, summary, category, published_at FROM articles WHERE (title ILIKE $1 OR summary ILIKE $1 OR content ILIKE $1) ORDER BY published_at DESC LIMIT $2 OFFSET $3",
        ['%' + q + '%', pageSize, offset]
      )).rows
    } catch (_e) {
      source = 'primary'
      rows = (await pool.query(
        "SELECT id, title, summary, category, published_at FROM articles WHERE (title ILIKE $1 OR summary ILIKE $1 OR content ILIKE $1) ORDER BY published_at DESC LIMIT $2 OFFSET $3",
        ['%' + q + '%', pageSize, offset]
      )).rows
    }
    res.set('X-DB-Source', source)
    res.json(rows)
  } catch (e) {
    res.set('X-DB-Source', 'fallback')
    res.json([])
  }
})

app.get('/api/recommend/:id', async (req, res) => {
  try {
    const id = String(req.params.id)
    let catRows
    let source = 'replica'
    try {
      catRows = (await readPool.query('SELECT category FROM articles WHERE id = $1', [id])).rows
    } catch (_e) {
      source = 'primary'
      catRows = (await pool.query('SELECT category FROM articles WHERE id = $1', [id])).rows
    }
    const cat = (catRows[0] && catRows[0].category) || null
    let rows
    if (cat) {
      if (source === 'replica') {
        rows = (await readPool.query('SELECT id, title FROM articles WHERE category = $1 AND id <> $2 ORDER BY published_at DESC LIMIT 8', [cat, id])).rows
      } else {
        rows = (await pool.query('SELECT id, title FROM articles WHERE category = $1 AND id <> $2 ORDER BY published_at DESC LIMIT 8', [cat, id])).rows
      }
    } else {
      if (source === 'replica') {
        rows = (await readPool.query('SELECT id, title FROM articles WHERE id <> $1 ORDER BY published_at DESC LIMIT 8', [id])).rows
      } else {
        rows = (await pool.query('SELECT id, title FROM articles WHERE id <> $1 ORDER BY published_at DESC LIMIT 8', [id])).rows
      }
    }
    res.set('X-DB-Source', source)
    res.json(rows)
  } catch (e) {
    res.set('X-DB-Source', 'fallback')
    res.json([])
  }
})

app.get('/api/hot', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10))
    const pageSize = Math.max(1, Math.min(20, parseInt(req.query.pageSize || '10', 10)))
    const offset = (page - 1) * pageSize
    let rows
    let source = 'replica'
    try {
      rows = (await readPool.query('SELECT id, title, summary, category, published_at FROM articles ORDER BY published_at DESC LIMIT $1 OFFSET $2', [pageSize, offset])).rows
    } catch (_e) {
      source = 'primary'
      rows = (await pool.query('SELECT id, title, summary, category, published_at FROM articles ORDER BY published_at DESC LIMIT $1 OFFSET $2', [pageSize, offset])).rows
    }
    res.set('X-DB-Source', source)
    res.json(rows)
  } catch (e) {
    res.set('X-DB-Source', 'fallback')
    res.json([])
  }
})

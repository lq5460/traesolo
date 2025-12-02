const urls = [
  '/?category=all&page=1&v=1',
  '/api/articles?category=all&page=1',
  '/api/categories'
]
const cats = ['架构','微服务','数据库','前端','推荐']

function hr() { return Date.now() }

async function hit(base, path) {
  const t0 = hr()
  const res = await fetch(base + path)
  const t1 = hr()
  return { ok: res.ok, status: res.status, ms: t1 - t0, path }
}

async function run({ base = 'http://127.0.0.1:8080', total = 100, concurrency = 10 } = {}) {
  const tasks = []
  for (let i = 0; i < total; i++) {
    const pick = Math.random()
    if (pick < 0.4) tasks.push(() => hit(base, '/?category=all&page=1&v=1'))
    else if (pick < 0.7) {
      const c = cats[Math.floor(Math.random() * cats.length)]
      tasks.push(() => hit(base, `/?category=${encodeURIComponent(c)}&page=1&v=1`))
    } else tasks.push(() => hit(base, '/api/articles?category=all&page=1'))
  }
  const results = []
  let idx = 0
  async function worker() {
    while (idx < tasks.length) {
      const t = tasks[idx++]
      try { results.push(await t()) } catch (e) { results.push({ ok: false, status: 0, ms: 0, path: 'error' }) }
    }
  }
  await Promise.all(new Array(concurrency).fill(0).map(() => worker()))
  const times = results.map(r => r.ms).sort((a,b)=>a-b)
  const ok = results.filter(r => r.ok).length
  const p50 = times[Math.floor(times.length*0.5)] || 0
  const p95 = times[Math.floor(times.length*0.95)] || 0
  const p99 = times[Math.floor(times.length*0.99)] || 0
  const max = times[times.length-1] || 0
  const avg = times.reduce((a,b)=>a+b,0) / (times.length || 1)
  console.log('total', results.length, 'ok', ok, 'avg', Math.round(avg), 'p50', p50, 'p95', p95, 'p99', p99, 'max', max)
}

run({ total: Number(process.env.TOTAL || 100), concurrency: Number(process.env.CONCURRENCY || 10) })

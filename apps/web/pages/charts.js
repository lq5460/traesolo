export async function getServerSideProps(ctx) {
  const base = process.env.API_INTERNAL_BASE || process.env.NEXT_PUBLIC_API_BASE || '/api'
  let stats = { total: 0, errors: 0, routes: {}, latency: { lt50: 0, lt100: 0, lt200: 0, lt500: 0, gte500: 0 } }
  try {
    const r = await fetch(`${base}/stats`)
    stats = r.ok ? await r.json() : stats
  } catch {}
  return { props: { stats } }
}

function Bar({ label, value, max }) {
  const w = Math.max(2, Math.round((value / (max || 1)) * 300))
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
      <div style={{ width: 140 }}>{label}</div>
      <div style={{ background: '#4e79a7', height: 14, width: w }}></div>
      <div style={{ marginLeft: 8 }}>{value}</div>
    </div>
  )
}

export default function Charts({ stats }) {
  const React = require('react')
  const [data, setData] = React.useState(stats)
  const [loading, setLoading] = React.useState(false)
  const [result, setResult] = React.useState(null)
  React.useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE || '/api'
    const id = setInterval(() => {
      fetch(`${base}/stats`).then(async (r) => {
        const j = await r.json()
        setData(j)
      }).catch(() => {})
    }, 2000)
    return () => clearInterval(id)
  }, [])
  const maxRoute = Math.max(1, ...Object.values(data.routes || {}))
  const buckets = [
    { label: '<50ms', value: data.latency.lt50 },
    { label: '<100ms', value: data.latency.lt100 },
    { label: '<200ms', value: data.latency.lt200 },
    { label: '<500ms', value: data.latency.lt500 },
    { label: '>=500ms', value: data.latency.gte500 }
  ]
  const maxBucket = Math.max(1, ...buckets.map(b => b.value))
  function startLoad(total = 500, concurrency = 50) {
    const base = process.env.NEXT_PUBLIC_API_BASE || '/api'
    setLoading(true)
    fetch(`${base}/load?total=${total}&concurrency=${concurrency}`).then(async (r) => {
      const j = await r.json()
      setResult(j)
    }).catch(() => {}).finally(() => setLoading(false))
  }
  return (
    <main style={{ maxWidth: 900, margin: '40px auto', fontFamily: 'system-ui, -apple-system' }}>
      <h1>可观测与压测</h1>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => startLoad(500, 50)} disabled={loading}>{loading ? '运行中...' : '运行压测（500/50）'}</button>
        <button onClick={() => startLoad(2000, 100)} style={{ marginLeft: 12 }} disabled={loading}>运行压测（2000/100）</button>
      </div>
      {result ? (
        <div style={{ marginBottom: 20, padding: 10, background: '#f6f8fa' }}>
          <div>base: {result.base}</div>
          <div>concurrency: {result.concurrency}</div>
          <div>total: {result.summary.total} ok: {result.summary.ok}</div>
          <div>avg: {result.summary.avg}ms p50: {result.summary.p50} p90: {result.summary.p90} p95: {result.summary.p95} p99: {result.summary.p99} max: {result.summary.max}</div>
        </div>
      ) : null}
      <section style={{ marginTop: 20 }}>
        <h2>延迟分布</h2>
        {buckets.map((b) => (<Bar key={b.label} label={b.label} value={b.value} max={maxBucket} />))}
      </section>
      <section style={{ marginTop: 20 }}>
        <h2>各路由请求数</h2>
        {Object.entries(data.routes || {}).map(([route, count]) => (
          <Bar key={route} label={route} value={count} max={maxRoute} />
        ))}
      </section>
      <section style={{ marginTop: 12, color: '#666' }}>
        <div>总请求：{data.total}，错误：{data.errors}</div>
        <div><a href="/api/metrics" target="_blank" rel="noreferrer">/api/metrics</a> | <a href="/api/stats" target="_blank" rel="noreferrer">/api/stats</a> | <a href="/edge/vars" target="_blank" rel="noreferrer">/edge/vars</a></div>
      </section>
    </main>
  )
}

export async function getServerSideProps(ctx) {
  const base = process.env.API_INTERNAL_BASE || process.env.NEXT_PUBLIC_API_BASE || 'http://api:3000'
  const q = String(ctx.query.q || '').trim()
  const page = Math.max(1, parseInt(ctx.query.page || '1', 10))
  let version = '1'
  let items = []
  try {
    const vRes = await fetch(`${base}/version/list`)
    const vJson = await vRes.json()
    version = vJson.version || '1'
    var edgeUpstream = vRes.headers.get('x-upstream') || ''
    var edgeCache = vRes.headers.get('x-cache-status') || ''
  } catch {}
  if (String(ctx.query.v || '') !== String(version)) {
    return { redirect: { destination: `/search?q=${encodeURIComponent(q)}&page=${page}&v=${version}`, permanent: false } }
  }
  try {
    if (q) {
      const r = await fetch(`${base}/search?q=${encodeURIComponent(q)}&page=${page}&v=${version}`)
      items = r.ok ? await r.json() : []
      var dbSource = r.headers.get('x-db-source') || null
    }
  } catch {}
  return { props: { q, page, items, edgeUpstream: edgeUpstream || null, edgeCache: edgeCache || null, dbSource: dbSource || null } }
}

export default function SearchPage({ q, page, items, edgeUpstream, edgeCache, dbSource }) {
  const React = require('react')
  const [edgeInfo, setEdgeInfo] = React.useState({ upstream: edgeUpstream || null, cache: edgeCache || null })
  React.useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE || '/api'
    fetch(`${base}/version/list`).then(async (r) => {
      const up = r.headers.get('x-source') || r.headers.get('x-upstream') || ''
      const ca = r.headers.get('x-cache-status') || ''
      setEdgeInfo({ upstream: up || edgeInfo.upstream || null, cache: ca || edgeInfo.cache || null })
    }).catch(() => {})
  }, [])
  return (
    <main style={{ maxWidth: 800, margin: '40px auto', fontFamily: 'system-ui, -apple-system' }}>
      <h1>搜索</h1>
      <form method="GET" action="/search" style={{ marginBottom: 16 }}>
        <input type="text" name="q" defaultValue={q} placeholder="搜索标题或摘要" style={{ width: 300, marginRight: 8 }} />
        <input type="hidden" name="v" value={typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('v') || ''} />
        <button type="submit">搜索</button>
      </form>
      <ul>
        {(items || []).map((a) => (
          <li key={a.id} style={{ marginBottom: 12 }}>
            <a href={`/articles/${a.id}`}>{a.title}</a>
            {a.summary ? <div style={{ color: '#666' }}>{a.summary}</div> : null}
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 12 }}>
        <a href={`/search?q=${encodeURIComponent(q)}&page=${Math.max(1, page - 1)}&v=${typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('v') || ''}`} style={{ marginRight: 12 }}>上一页</a>
        <a href={`/search?q=${encodeURIComponent(q)}&page=${page + 1}&v=${typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('v') || ''}`}>下一页</a>
      </div>
      <footer style={{ marginTop: 20, color: '#999' }}>
        <div>Upstream: {edgeInfo.upstream || 'n/a'}</div>
        <div>Cache: {edgeInfo.cache || 'n/a'}</div>
        <div>DB: {dbSource || 'n/a'}</div>
      </footer>
    </main>
  )
}

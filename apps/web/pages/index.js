export async function getServerSideProps(ctx) {
  const base = process.env.API_INTERNAL_BASE || process.env.NEXT_PUBLIC_API_BASE || 'http://api:3000'
  const page = parseInt(ctx.query.page || '1', 10)
  const category = ctx.query.category || 'all'
  let version = '1'
  let categories = []
  let articles = []
  async function getJson(u) {
    const r = await fetch(u)
    if (!r.ok) throw new Error('bad')
    return { data: await r.json(), headers: r.headers }
  }
  try {
    const v = await getJson(`${base}/version/list`)
    version = v.data.version || '1'
    var edgeUpstream = v.headers.get('x-upstream') || ''
    var edgeCache = v.headers.get('x-cache-status') || ''
  } catch {}
  if (String(ctx.query.v || '') !== String(version)) {
    return {
      redirect: {
        destination: `/?category=${encodeURIComponent(category)}&page=${page}&v=${version}`,
        permanent: false
      }
    }
  }
  try {
    const c = await getJson(`${base}/categories`)
    categories = c.data
  } catch {}
  let sections = []
  try {
    if (category && category !== 'all') {
      const f = await getJson(`${base}/articles?category=${encodeURIComponent(category)}&page=${page}&v=${version}`)
      articles = f.data || []
      var dbSource = f.headers.get('x-db-source') || null
      sections = []
    } else {
      const f = await getJson(`${base}/feeds/home?v=${version}`)
      articles = f.data.latest || []
      var dbSource = f.headers.get('x-db-source') || null
      sections = f.data.sections || []
    }
  } catch (_e) {
    articles = [
      { id: 1, title: '欢迎使用资讯网站', summary: '这是一个示例文章，展示基本功能' }
    ]
    sections = []
  }
  return { props: { articles, sections: sections || [], page, category, categories, edgeUpstream: edgeUpstream || null, edgeCache: edgeCache || null, dbSource: dbSource || null } }
}

export default function Home({ articles, sections, page, category, categories, edgeUpstream, edgeCache, dbSource }) {
  const [edgeInfo, setEdgeInfo] = require('react').useState({ upstream: edgeUpstream || null, cache: edgeCache || null })
  require('react').useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE || '/api'
    fetch(`${base}/version/list?nocache=1&ts=${Date.now()}`).then(async (r) => {
      const up = r.headers.get('x-source') || r.headers.get('x-upstream') || ''
      const ca = r.headers.get('x-cache-status') || ''
      setEdgeInfo({ upstream: up || edgeInfo.upstream || null, cache: ca || edgeInfo.cache || null })
    }).catch(() => {})
  }, [])
  return (
    <main style={{ maxWidth: 800, margin: '40px auto', fontFamily: 'system-ui, -apple-system' }}>
      <h1>资讯首页</h1>
      <p style={{ color: '#666' }}>分类：{category} | 页码：{page}</p>
      <div style={{ marginBottom: 16 }}>
        <form method="GET" action="/search" style={{ display: 'inline-block', marginRight: 16 }}>
          <input type="text" name="q" placeholder="搜索标题或摘要" style={{ width: 220, marginRight: 8 }} />
          <input type="hidden" name="v" value={typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('v') || ''} />
          <button type="submit">搜索</button>
        </form>
        <strong>分类筛选：</strong>
        <a href={`/?category=all&page=1&v=${typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('v') || ''}`} style={{ marginRight: 8 }}>全部</a>
        {(categories || []).map((c) => (
          <a key={c} href={`/?category=${encodeURIComponent(c)}&page=1&v=${typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('v') || ''}`} style={{ marginRight: 8 }}>{c}</a>
        ))}
      </div>
      <h2>最新</h2>
      <ul>
        {articles.map((a) => (
          <li key={a.id} style={{ marginBottom: 12 }}>
            <a href={`/articles/${a.id}`} style={{ fontSize: 18 }}>{a.title}</a>
            {a.summary ? <p style={{ color: '#666' }}>{a.summary}</p> : null}
          </li>
        ))}
      </ul>
      {(sections || []).map((s) => (
        <section key={s.category} style={{ marginTop: 24 }}>
          <h3>{s.category}</h3>
          <ul>
            {(s.items || []).map((a) => (
              <li key={a.id} style={{ marginBottom: 8 }}>
                <a href={`/articles/${a.id}`}>{a.title}</a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div style={{ marginTop: 12 }}>
        <a href={`/?category=${encodeURIComponent(category)}&page=${Math.max(1, page - 1)}&v=${typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('v') || ''}`} style={{ marginRight: 12 }}>上一页</a>
        <a href={`/?category=${encodeURIComponent(category)}&page=${page + 1}&v=${typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('v') || ''}`}>下一页</a>
      </div>
      <footer style={{ marginTop: 20, color: '#999' }}>
        <div>Upstream: {edgeInfo.upstream || 'n/a'}</div>
        <div>Cache: {edgeInfo.cache || 'n/a'}</div>
        <div>DB: {dbSource || 'n/a'}</div>
      </footer>
    </main>
  )
}

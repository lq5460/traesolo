export async function getServerSideProps(ctx) {
  const { id } = ctx.params
  const base = process.env.API_INTERNAL_BASE || process.env.NEXT_PUBLIC_API_BASE || 'http://api:3000'
  let version = '1'
  try {
    const vRes = await fetch(`${base}/version/list`)
    const vJson = await vRes.json()
    version = vJson.version || '1'
    var edgeUpstream = vRes.headers.get('x-upstream') || ''
    var edgeCache = vRes.headers.get('x-cache-status') || ''
  } catch {}
  if (String(ctx.query.v || '') !== String(version)) {
    return {
      redirect: {
        destination: `/articles/${id}?v=${version}`,
        permanent: false
      }
    }
  }
  let article = null
  try {
    const res = await fetch(`${base}/articles/${id}?v=${version}`)
    article = res.ok ? await res.json() : null
    var dbSource = res.headers.get('x-db-source') || null
  } catch (_e) {
    article = {
      id: Number(id) || 1,
      title: '欢迎使用资讯网站',
      summary: '这是一个示例文章，展示基本功能',
      content: '从0到百万用户的系统设计实践：分层、缓存、读写分离与异步化.',
      published_at: new Date().toISOString()
    }
  }
  const displayPublishedAt = (article && article.published_at)
    ? new Date(article.published_at).toISOString().replace('T', ' ').substring(0, 19)
    : new Date().toISOString().replace('T', ' ').substring(0, 19)
  return { props: { article, displayPublishedAt, edgeUpstream: edgeUpstream || null, edgeCache: edgeCache || null, dbSource: dbSource || null } }
}

export default function ArticlePage({ article, displayPublishedAt, edgeUpstream, edgeCache, dbSource }) {
  const React = require('react')
  const [edgeInfo, setEdgeInfo] = React.useState({ upstream: edgeUpstream || null, cache: edgeCache || null })
  const [recs, setRecs] = React.useState([])
  React.useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE || '/api'
    fetch(`${base}/version/list`)
      .then(async (r) => {
        const up = r.headers.get('x-source') || r.headers.get('x-upstream') || ''
        const ca = r.headers.get('x-cache-status') || ''
        setEdgeInfo({ upstream: up || edgeInfo.upstream || null, cache: ca || edgeInfo.cache || null })
      })
      .catch(() => {})
  }, [])
  React.useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE || '/api'
    if (article && article.id) {
      fetch(`${base}/recommend/${article.id}`).then(async (r) => {
        const arr = await r.json()
        setRecs(Array.isArray(arr) ? arr : [])
      }).catch(() => {})
    }
  }, [article && article.id])
  if (!article) return <main style={{ maxWidth: 800, margin: '40px auto' }}>文章不存在</main>
  return (
    <main style={{ maxWidth: 800, margin: '40px auto', fontFamily: 'system-ui, -apple-system' }}>
      <h1>{article.title}</h1>
      {article.summary ? <p style={{ color: '#666' }}>{article.summary}</p> : null}
      <article style={{ marginTop: 20, lineHeight: 1.7 }}>{article.content || '暂无正文'}</article>
      <p style={{ marginTop: 24, color: '#888' }} suppressHydrationWarning>发布时间：{displayPublishedAt}</p>
      {recs && recs.length ? (
        <section style={{ marginTop: 24 }}>
          <h3>相关推荐</h3>
          <ul>
            {recs.map((r) => (
              <li key={r.id} style={{ marginBottom: 8 }}>
                <a href={`/articles/${r.id}`}>{r.title}</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <footer style={{ marginTop: 20, color: '#999' }}>
        <div>Upstream: {edgeInfo.upstream || 'n/a'}</div>
        <div>Cache: {edgeInfo.cache || 'n/a'}</div>
        <div>DB: {dbSource || 'n/a'}</div>
      </footer>
    </main>
  )
}

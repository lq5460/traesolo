import { Kafka } from 'kafkajs'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'

const broker = process.env.KAFKA_BROKER || 'redpanda:9092'
const base = process.env.SNAPSHOT_FETCH_BASE || 'http://nginx'

async function snapshotArticle(id) {
  let v = '1'
  try {
    const vRes = await fetch(`${base}/api/version/list`)
    const vJson = await vRes.json()
    v = vJson.version || '1'
  } catch {}
  const res = await fetch(`${base}/articles/${id}?v=${v}&nocache=1&ts=${Date.now()}`)
  const html = await res.text()
  const dir = path.join('/data/snapshots', 'articles')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${id}.html`), html)
  console.log('snapshot written', id, html.length)
}

async function snapshotHome() {
  let v = '1'
  try {
    const vRes = await fetch(`${base}/api/version/list`)
    const vJson = await vRes.json()
    v = vJson.version || '1'
  } catch {}
  const res = await fetch(`${base}/?v=${v}&nocache=1&ts=${Date.now()}`)
  const html = await res.text()
  const file = path.join('/data/snapshots', 'index.html')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, html)
  console.log('home snapshot written', html.length)
}

async function updateStats(id) {
  // placeholder: stats aggregation can be pushed to redis/api in future
  console.log('view event', id)
}

async function run() {
  const kafka = new Kafka({ brokers: [broker] })
  const consumer = kafka.consumer({ groupId: 'news-worker' })
  await consumer.connect()
  await consumer.subscribe({ topic: 'article_published', fromBeginning: false })
  await consumer.subscribe({ topic: 'article_viewed', fromBeginning: false })
  await consumer.subscribe({ topic: 'home_snapshot', fromBeginning: false })

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const payload = JSON.parse(message.value.toString())
        if (topic === 'article_published') {
          await snapshotArticle(payload.id)
        } else if (topic === 'article_viewed') {
          await updateStats(payload.id)
        } else if (topic === 'home_snapshot') {
          await snapshotHome()
        }
      } catch (e) {
        console.error('worker error', e)
      }
    }
  })
}

run().catch((e) => {
  console.error('worker failed', e)
  process.exit(1)
})

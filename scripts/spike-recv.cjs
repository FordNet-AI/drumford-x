/**
 * SPIKE / THROWAWAY — tiny localhost sink that receives a data-URL image
 * POSTed from the running app's canvas and writes it to public/spike-demo/.
 * Lets us pull a real screenshot of the highway out of a headless preview
 * (where the screenshot tool can't capture a hidden page) with no base64
 * round-trip through the agent. Delete with the rest of the spike.
 *
 *   node scripts/spike-recv.cjs        # listens on 127.0.0.1:7777
 *   (then POST a data: URL; the URL path becomes the output filename)
 */
const http = require('http')
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '..', 'public', 'spike-demo')
fs.mkdirSync(OUT, { recursive: true })

const server = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }
  if (req.method !== 'POST') {
    res.writeHead(200, cors)
    res.end('spike-recv up')
    return
  }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    try {
      const b64 = body.replace(/^data:image\/\w+;base64,/, '')
      const name = (req.url && req.url.length > 1 ? req.url.slice(1) : 'frame.png').replace(/[^\w.\-]/g, '_')
      const buf = Buffer.from(b64, 'base64')
      fs.writeFileSync(path.join(OUT, name), buf)
      console.log(`[recv] wrote ${name} (${buf.length} bytes)`)
      res.writeHead(200, cors)
      res.end('ok')
    } catch (e) {
      console.error('[recv] error:', e)
      res.writeHead(500, cors)
      res.end('err')
    }
  })
})

server.listen(7777, '127.0.0.1', () => console.log('[recv] listening on http://127.0.0.1:7777'))

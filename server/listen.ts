import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { handleApi } from './api.ts'

const distDir = path.join(process.cwd(), 'dist')
const port = Number(process.env.PORT) || 3000

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

function safeFile(urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split('?')[0] || '/')
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  const full = path.normalize(path.join(distDir, relative))
  if (!full.startsWith(distDir)) return null
  return full
}

function sendFile(res: http.ServerResponse, file: string): void {
  const stream = fs.createReadStream(file)
  res.statusCode = 200
  res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream')
  stream.pipe(res)
}

const server = http.createServer((req, res) => {
  void (async () => {
    if (await handleApi(req, res)) return

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405
      res.end()
      return
    }

    const requested = safeFile(req.url ?? '/')
    if (requested && fs.existsSync(requested) && fs.statSync(requested).isFile()) {
      sendFile(res, requested)
      return
    }

    const index = path.join(distDir, 'index.html')
    if (fs.existsSync(index)) {
      sendFile(res, index)
      return
    }

    res.statusCode = 404
    res.end('Not found')
  })()
})

server.listen(port, () => {
  const password = process.env.APP_PASSWORD?.trim()
  if (!password) {
    console.warn('APP_PASSWORD is empty: anyone with the URL can read and overwrite the ledger')
  }
  console.log(`BookingRoom listening on ${port}`)
})

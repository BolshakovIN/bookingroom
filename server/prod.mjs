import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash, timingSafeEqual } from 'node:crypto'
import initSqlJs from 'sql.js'

const require = createRequire(import.meta.url)
const wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm')
const distDir = path.join(process.cwd(), 'dist')
const port = Number(process.env.PORT) || 8080

const emptyState = {
  apartments: [{ id: 'default', name: 'Квартира 1' }],
  activeApartmentId: 'default',
  entries: [],
}

function dataDir() {
  return (
    process.env.RAILWAY_VOLUME_MOUNT_PATH ||
    process.env.DATA_DIR ||
    path.join(process.cwd(), 'data')
  )
}

function dbFile() {
  return path.join(dataDir(), 'bookingroom.db')
}

let database = null

async function getDb() {
  if (database) return database
  const SQL = await initSqlJs({ locateFile: () => wasmPath })
  mkdirSync(dataDir(), { recursive: true })
  const file = dbFile()
  database = existsSync(file) ? new SQL.Database(readFileSync(file)) : new SQL.Database()
  database.run(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL
    );
  `)
  writeFileSync(dbFile(), Buffer.from(database.export()))
  return database
}

function persist() {
  if (!database) return
  writeFileSync(dbFile(), Buffer.from(database.export()))
}

async function getState() {
  const db = await getDb()
  const stmt = db.prepare('SELECT payload FROM app_state WHERE id = 1')
  if (stmt.step()) {
    const payload = stmt.getAsObject().payload
    stmt.free()
    try {
      const parsed = JSON.parse(String(payload))
      if (parsed && typeof parsed === 'object') return parsed
    } catch {
      return emptyState
    }
  }
  stmt.free()
  return emptyState
}

async function setState(raw) {
  const state = raw && typeof raw === 'object' ? raw : emptyState
  const db = await getDb()
  db.run('DELETE FROM app_state')
  db.run('INSERT INTO app_state (id, payload) VALUES (1, ?)', [JSON.stringify(state)])
  persist()
  return state
}

function expectedPassword() {
  return process.env.APP_PASSWORD?.trim() ?? ''
}

function authorized(req) {
  const expected = expectedPassword()
  if (!expected) return true
  const header = req.headers['x-booking-key']
  const provided = Array.isArray(header) ? header[0] : header
  if (!provided) return false
  return timingSafeEqual(
    createHash('sha256').update(provided).digest(),
    createHash('sha256').update(expected).digest(),
  )
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

function safeFile(urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0] || '/')
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  const full = path.normalize(path.join(distDir, relative))
  if (!full.startsWith(distDir)) return null
  return full
}

const server = http.createServer((req, res) => {
  void (async () => {
    const url = req.url?.split('?')[0] ?? ''

    if (url === '/api/health') {
      sendJson(res, 200, { ok: true, auth: Boolean(expectedPassword()) })
      return
    }

    if (url === '/api/state' || url === '/api/entries') {
      if (!authorized(req)) {
        sendJson(res, 401, { error: 'Нужен пароль' })
        return
      }
      if (req.method === 'GET') {
        sendJson(res, 200, await getState())
        return
      }
      if (req.method === 'PUT') {
        try {
          const body = JSON.parse((await readBody(req)) || '{}')
          sendJson(res, 200, await setState(body))
        } catch {
          sendJson(res, 400, { error: 'Некорректные данные' })
        }
        return
      }
      res.statusCode = 405
      res.end()
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405
      res.end()
      return
    }

    const requested = safeFile(req.url)
    if (requested && existsSync(requested) && statSync(requested).isFile()) {
      res.statusCode = 200
      res.setHeader('Content-Type', MIME[path.extname(requested)] ?? 'application/octet-stream')
      createReadStream(requested).pipe(res)
      return
    }

    const index = path.join(distDir, 'index.html')
    if (existsSync(index)) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      createReadStream(index).pipe(res)
      return
    }

    res.statusCode = 404
    res.end('Not found')
  })().catch((error) => {
    console.error(error)
    if (!res.headersSent) {
      res.statusCode = 500
      res.end('Internal error')
    }
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`BookingRoom listening on 0.0.0.0:${port}`)
})

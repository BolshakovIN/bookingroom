import { createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { getState, setState } from './db.ts'

const AUTH_HEADER = 'x-booking-key'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function expectedPassword(): string {
  return process.env.APP_PASSWORD?.trim() ?? ''
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function passwordMatches(provided: string, expected: string): boolean {
  return timingSafeEqual(digest(provided), digest(expected))
}

function isAuthorized(req: IncomingMessage): boolean {
  const expected = expectedPassword()
  if (!expected) return true
  const header = req.headers[AUTH_HEADER]
  const provided = Array.isArray(header) ? header[0] : header
  if (!provided) return false
  return passwordMatches(provided, expected)
}

export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url?.split('?')[0] ?? ''

  if (url === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, auth: Boolean(expectedPassword()) })
    return true
  }

  if (url !== '/api/state' && url !== '/api/entries') return false

  if (!isAuthorized(req)) {
    sendJson(res, 401, { error: 'Нужен пароль' })
    return true
  }

  if (req.method === 'GET') {
    sendJson(res, 200, await getState())
    return true
  }

  if (req.method === 'PUT') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}') as unknown
      const state = await setState(body)
      sendJson(res, 200, state)
    } catch {
      sendJson(res, 400, { error: 'Некорректные данные' })
    }
    return true
  }

  res.statusCode = 405
  res.end()
  return true
}

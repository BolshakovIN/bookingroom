import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { getState, setState } from './db.ts'

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

async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url?.split('?')[0] ?? ''
  if (url !== '/api/state' && url !== '/api/entries') return false

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

export function persistencePlugin(): Plugin {
  return {
    name: 'bookingroom-db',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApi(req, res).then((handled) => {
          if (!handled) next()
        })
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApi(req, res).then((handled) => {
          if (!handled) next()
        })
      })
    },
  }
}

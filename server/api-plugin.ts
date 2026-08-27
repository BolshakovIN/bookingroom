import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { handleApi } from './api.ts'

export function persistencePlugin(): Plugin {
  return {
    name: 'bookingroom-db',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApi(req as IncomingMessage, res as ServerResponse).then((handled) => {
          if (!handled) next()
        })
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApi(req as IncomingMessage, res as ServerResponse).then((handled) => {
          if (!handled) next()
        })
      })
    },
  }
}

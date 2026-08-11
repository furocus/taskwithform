import type { IncomingMessage, ServerResponse } from 'node:http'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

const MOCK_COURSE_COUNT = 3

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

function sendNoContent(response: ServerResponse) {
  response.statusCode = 204
  response.setHeader('Cache-Control', 'no-store')
  response.end()
}

function isApiPath(pathname: string) {
  return pathname === '/api' || pathname.startsWith('/api/')
}

export function createMockApiPlugin(): Plugin {
  return {
    name: 'mock-frontend-preview-api',
    configureServer(server) {
      server.middlewares.use(
        (
          request: IncomingMessage,
          response: ServerResponse,
          next: () => void,
        ) => {
          const rawUrl = request.url ?? '/'
          let pathname

          try {
            pathname = new URL(rawUrl, 'http://localhost').pathname
          } catch {
            if (rawUrl === '/api' || rawUrl.startsWith('/api/')) {
              sendJson(response, 404, {
                error: {
                  code: 'not_found',
                  message: 'Mock API route not found.',
                },
              })
              return
            }

            next()
            return
          }

          if (!isApiPath(pathname)) {
            next()
            return
          }

          const method = request.method?.toUpperCase()

          if (method === 'GET' && pathname === '/api/auth/session') {
            sendJson(response, 200, { authenticated: true })
            return
          }

          if (method === 'GET' && pathname === '/api/classroom/courses/count') {
            sendJson(response, 200, { count: MOCK_COURSE_COUNT })
            return
          }

          if (method === 'POST' && pathname === '/api/auth/logout') {
            sendNoContent(response)
            return
          }

          sendJson(response, 404, {
            error: { code: 'not_found', message: 'Mock API route not found.' },
          })
        },
      )
    },
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), createMockApiPlugin()],
  server: {
    host: 'localhost',
    port: 5174,
    strictPort: true,
  },
})

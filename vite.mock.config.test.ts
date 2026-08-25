import { describe, expect, it, vi } from 'vitest'

import { createMockApiPlugin } from './vite.mock.config'

type MockResponse = {
  statusCode?: number
  headers: Record<string, string>
  body?: string
  setHeader(name: string, value: string): void
  end(body?: string): void
}

type MockHandler = (
  request: { method?: string; url?: string },
  response: MockResponse,
  next: () => void,
) => void

function createHandler() {
  const use = vi.fn()
  const configureServer = createMockApiPlugin().configureServer

  if (typeof configureServer !== 'function') {
    throw new Error('Mock API plugin must configure a Vite server.')
  }

  configureServer({ middlewares: { use } } as never)

  return use.mock.calls[0]?.[0] as MockHandler
}

function request(handler: MockHandler, method: string, url: string) {
  const response: MockResponse = {
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    end(body) {
      this.body = body
    },
  }
  const next = vi.fn()

  handler({ method, url }, response, next)

  return { response, next }
}

describe('mock frontend preview API', () => {
  it('serves authenticated session and a fixed course count', () => {
    const handler = createHandler()

    const session = request(handler, 'GET', '/api/auth/session')
    const count = request(handler, 'GET', '/api/classroom/courses/count')

    expect(session.response.statusCode).toBe(200)
    expect(session.response.headers['content-type']).toBe(
      'application/json; charset=utf-8',
    )
    expect(JSON.parse(session.response.body ?? '')).toEqual({
      authenticated: true,
    })
    expect(JSON.parse(count.response.body ?? '')).toEqual({ count: 3 })

    const formResponse = request(
      handler,
      'GET',
      '/api/gmail/forms/sample-form/response',
    )
    expect(formResponse.response.statusCode).toBe(200)
    expect(JSON.parse(formResponse.response.body ?? '')).toEqual({
      formId: 'sample-form',
      status: 'submitted',
    })
  })

  it('returns no content for logout and does not fall through unknown API paths', () => {
    const handler = createHandler()

    const logout = request(handler, 'POST', '/api/auth/logout')
    const unknown = request(handler, 'GET', '/api/not-supported')

    expect(logout.response.statusCode).toBe(204)
    expect(logout.response.body).toBeUndefined()
    expect(unknown.response.statusCode).toBe(404)
    expect(JSON.parse(unknown.response.body ?? '')).toEqual({
      error: { code: 'not_found', message: 'Mock API route not found.' },
    })
    expect(unknown.next).not.toHaveBeenCalled()
  })

  it('passes non-API requests to the normal Vite middleware', () => {
    const handler = createHandler()

    const result = request(handler, 'GET', '/')

    expect(result.next).toHaveBeenCalledOnce()
    expect(result.response.statusCode).toBeUndefined()
  })
})

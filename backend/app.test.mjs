import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createRequestHandler } from './app.mjs'
import { MemorySessionStore } from './auth/session-store.mjs'
import { ClassroomRequestError } from './classroom/google-classroom.mjs'

const FRONTEND_ORIGIN = 'http://localhost:5173'
const NOW = Date.parse('2026-07-30T08:00:00.000Z')

function createFakeOAuthService(overrides = {}) {
  return {
    createAuthorizationUrl: vi.fn(
      (state) =>
        `https://accounts.example/authorize?state=${encodeURIComponent(state)}`,
    ),
    exchangeCode: vi.fn(async () => ({
      accessToken: 'access-token',
      expiresAt: NOW + 60 * 60 * 1000,
    })),
    revokeAccessToken: vi.fn(async () => {}),
    ...overrides,
  }
}

function createFakeClassroomService(overrides = {}) {
  return {
    countActiveCourses: vi.fn(async () => 3),
    ...overrides,
  }
}

async function sendRequest(
  handler,
  { method = 'GET', url = '/', headers = {} } = {},
) {
  let statusCode
  let responseHeaders = {}
  let responseBody = ''
  const response = {
    writeHead(nextStatusCode, nextHeaders = {}) {
      statusCode = nextStatusCode
      responseHeaders = nextHeaders
    },
    end(body = '') {
      responseBody = body
    },
  }

  await handler({ method, url, headers }, response)

  return {
    status: statusCode,
    body: responseBody,
    json() {
      return JSON.parse(responseBody)
    },
    header(name) {
      const matchingKey = Object.keys(responseHeaders).find(
        (key) => key.toLowerCase() === name.toLowerCase(),
      )
      return matchingKey === undefined
        ? undefined
        : responseHeaders[matchingKey]
    },
  }
}

function readCookie(response) {
  return response.header('set-cookie')?.split(';')[0]
}

describe('backend authentication routes', () => {
  let now
  let oauthService
  let classroomService
  let logger
  let handler

  beforeEach(() => {
    now = NOW
    oauthService = createFakeOAuthService()
    classroomService = createFakeClassroomService()
    logger = {
      error: vi.fn(),
      warn: vi.fn(),
    }
    const sessionStore = new MemorySessionStore({ now: () => now })
    handler = createRequestHandler({
      environment: {
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        FRONTEND_ORIGIN,
      },
      now: () => now,
      stateFactory: () => 'state-value',
      sessionStore,
      oauthServiceFactory: () => oauthService,
      classroomServiceFactory: () => classroomService,
      logger,
    })
  })

  async function startAuthentication() {
    return sendRequest(handler, {
      url: '/api/auth/google',
    })
  }

  async function completeAuthentication() {
    const startResponse = await startAuthentication()
    const pendingCookie = readCookie(startResponse)
    const callbackResponse = await sendRequest(handler, {
      url: '/api/auth/google/callback?code=code-value&state=state-value',
      headers: { cookie: pendingCookie },
    })

    return {
      callbackResponse,
      sessionCookie: readCookie(callbackResponse),
    }
  }

  it('keeps the health endpoint available without OAuth credentials', async () => {
    const isolatedHandler = createRequestHandler({ environment: {} })

    const response = await sendRequest(isolatedHandler, {
      url: '/api/health',
    })

    expect(response.status).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('starts OAuth with a pending session cookie and state', async () => {
    const response = await startAuthentication()

    expect(response.status).toBe(302)
    expect(response.header('location')).toBe(
      'https://accounts.example/authorize?state=state-value',
    )
    expect(response.header('set-cookie')).toContain('HttpOnly')
    expect(response.header('set-cookie')).toContain('SameSite=Lax')
    expect(readCookie(response)).toMatch(/^taskwithform\.sid=.+/)
  })

  it('marks the session cookie as secure in production', async () => {
    const productionHandler = createRequestHandler({
      environment: {
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        FRONTEND_ORIGIN,
        NODE_ENV: 'production',
      },
      stateFactory: () => 'state-value',
      oauthServiceFactory: () => oauthService,
    })

    const response = await sendRequest(productionHandler, {
      url: '/api/auth/google',
    })

    expect(response.header('set-cookie')).toContain('Secure')
  })

  it('returns a safe error when OAuth credentials are missing', async () => {
    const isolatedHandler = createRequestHandler({ environment: {} })

    const response = await sendRequest(isolatedHandler, {
      url: '/api/auth/google',
    })

    expect(response.status).toBe(503)
    expect(response.json()).toEqual({
      error: {
        code: 'oauth_not_configured',
        message: 'Google OAuth is not configured.',
      },
    })
  })

  it('exchanges a valid callback and exposes the session state', async () => {
    const { callbackResponse, sessionCookie } = await completeAuthentication()

    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.header('location')).toBe(`${FRONTEND_ORIGIN}/`)
    expect(oauthService.exchangeCode).toHaveBeenCalledWith('code-value')

    const sessionResponse = await sendRequest(handler, {
      url: '/api/auth/session',
      headers: { cookie: sessionCookie },
    })
    expect(sessionResponse.json()).toEqual({
      authenticated: true,
      expiresAt: '2026-07-30T09:00:00.000Z',
    })
  })

  it('rejects a callback whose state does not match', async () => {
    const startResponse = await startAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/auth/google/callback?code=code-value&state=wrong-state',
      headers: { cookie: readCookie(startResponse) },
    })

    expect(response.header('location')).toBe(
      `${FRONTEND_ORIGIN}/login?error=invalid_state`,
    )
    expect(oauthService.exchangeCode).not.toHaveBeenCalled()
    expect(response.header('set-cookie')).toContain('Max-Age=0')
  })

  it('rejects a callback after its pending state expires', async () => {
    const startResponse = await startAuthentication()
    now = NOW + 10 * 60 * 1000

    const response = await sendRequest(handler, {
      url: '/api/auth/google/callback?code=code-value&state=state-value',
      headers: { cookie: readCookie(startResponse) },
    })

    expect(response.header('location')).toBe(
      `${FRONTEND_ORIGIN}/login?error=invalid_state`,
    )
    expect(oauthService.exchangeCode).not.toHaveBeenCalled()
  })

  it('returns an access denied error after a valid cancelled callback', async () => {
    const startResponse = await startAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/auth/google/callback?error=access_denied&state=state-value',
      headers: { cookie: readCookie(startResponse) },
    })

    expect(response.header('location')).toBe(
      `${FRONTEND_ORIGIN}/login?error=access_denied`,
    )
  })

  it('returns an OAuth error when code exchange fails', async () => {
    oauthService.exchangeCode.mockRejectedValueOnce(
      new Error('sensitive upstream error'),
    )
    const startResponse = await startAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/auth/google/callback?code=bad-code&state=state-value',
      headers: { cookie: readCookie(startResponse) },
    })

    expect(response.header('location')).toBe(
      `${FRONTEND_ORIGIN}/login?error=oauth_failed`,
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('expires an authenticated session with its access token', async () => {
    const { sessionCookie } = await completeAuthentication()
    now = NOW + 60 * 60 * 1000

    const response = await sendRequest(handler, {
      url: '/api/auth/session',
      headers: { cookie: sessionCookie },
    })

    expect(response.json()).toEqual({ authenticated: false })
    expect(response.header('set-cookie')).toContain('Max-Age=0')
  })

  it('rejects a Classroom count request without a session', async () => {
    const response = await sendRequest(handler, {
      url: '/api/classroom/courses/count',
    })

    expect(response.status).toBe(401)
    expect(response.json()).toMatchObject({
      error: { code: 'unauthenticated' },
    })
    expect(classroomService.countActiveCourses).not.toHaveBeenCalled()
  })

  it('returns only the active Classroom course count', async () => {
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/classroom/courses/count',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(200)
    expect(response.json()).toEqual({ count: 3 })
    expect(classroomService.countActiveCourses).toHaveBeenCalledWith(
      'access-token',
    )
  })

  it('clears the session after a Classroom unauthorized response', async () => {
    classroomService.countActiveCourses.mockRejectedValueOnce(
      new ClassroomRequestError('upstream_error', { status: 401 }),
    )
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/classroom/courses/count',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(401)
    expect(response.json()).toMatchObject({
      error: { code: 'session_expired' },
    })
    expect(response.header('set-cookie')).toContain('Max-Age=0')

    const sessionResponse = await sendRequest(handler, {
      url: '/api/auth/session',
      headers: { cookie: sessionCookie },
    })
    expect(sessionResponse.json()).toEqual({ authenticated: false })
  })

  it('maps a Classroom forbidden response without clearing the session', async () => {
    classroomService.countActiveCourses.mockRejectedValueOnce(
      new ClassroomRequestError('upstream_error', { status: 403 }),
    )
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/classroom/courses/count',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(403)
    expect(response.json()).toMatchObject({
      error: { code: 'classroom_forbidden' },
    })

    const sessionResponse = await sendRequest(handler, {
      url: '/api/auth/session',
      headers: { cookie: sessionCookie },
    })
    expect(sessionResponse.json()).toMatchObject({ authenticated: true })
  })

  it('maps Classroom network and server failures to a safe gateway error', async () => {
    classroomService.countActiveCourses.mockRejectedValueOnce(
      new ClassroomRequestError('network_error'),
    )
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/classroom/courses/count',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(502)
    expect(response.json()).toEqual({
      error: {
        code: 'classroom_unavailable',
        message: 'Google Classroom is temporarily unavailable.',
      },
    })

    classroomService.countActiveCourses.mockRejectedValueOnce(
      new ClassroomRequestError('upstream_error', { status: 500 }),
    )

    const serverErrorResponse = await sendRequest(handler, {
      url: '/api/classroom/courses/count',
      headers: { cookie: sessionCookie },
    })

    expect(serverErrorResponse.status).toBe(502)
    expect(serverErrorResponse.json()).toMatchObject({
      error: { code: 'classroom_unavailable' },
    })
  })

  it('clears the session even when Google token revocation fails', async () => {
    oauthService.revokeAccessToken.mockRejectedValueOnce(
      new Error('sensitive upstream error'),
    )
    const { sessionCookie } = await completeAuthentication()

    const logoutResponse = await sendRequest(handler, {
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        cookie: sessionCookie,
        origin: FRONTEND_ORIGIN,
      },
    })

    expect(logoutResponse.status).toBe(204)
    expect(logoutResponse.header('set-cookie')).toContain('Max-Age=0')
    expect(oauthService.revokeAccessToken).toHaveBeenCalledWith('access-token')
    expect(logger.warn).toHaveBeenCalledWith(
      'Google access token revocation failed.',
    )

    const sessionResponse = await sendRequest(handler, {
      url: '/api/auth/session',
      headers: { cookie: sessionCookie },
    })
    expect(sessionResponse.json()).toEqual({
      authenticated: false,
    })
  })

  it('rejects logout requests from another origin', async () => {
    const response = await sendRequest(handler, {
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: 'https://attacker.example' },
    })

    expect(response.status).toBe(403)
    expect(response.json()).toMatchObject({
      error: { code: 'invalid_origin' },
    })
  })

  it('handles GET /api/gmail/forms/:formId/response for authenticated sessions', async () => {
    const unauthenticated = await sendRequest(handler, {
      method: 'GET',
      url: '/api/gmail/forms/sample-form/response',
    })
    expect(unauthenticated.status).toBe(401)

    const { sessionCookie } = await completeAuthentication()
    const authenticated = await sendRequest(handler, {
      method: 'GET',
      url: '/api/gmail/forms/sample-form/response',
      headers: { cookie: sessionCookie },
    })
    expect(authenticated.status).toBe(200)
    expect(authenticated.json()).toEqual({
      formId: 'sample-form',
      status: 'submitted',
    })
  })
})

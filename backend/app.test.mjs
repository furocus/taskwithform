import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createRequestHandler } from './app.mjs'
import {
  GOOGLE_CLASSROOM_COURSES_READONLY_SCOPE,
  GOOGLE_CLASSROOM_ANNOUNCEMENTS_READONLY_SCOPE,
  GOOGLE_CLASSROOM_COURSEWORK_MATERIALS_READONLY_SCOPE,
  GOOGLE_CLASSROOM_COURSEWORK_ME_READONLY_SCOPE,
  GOOGLE_CLASSROOM_STUDENT_SUBMISSIONS_ME_READONLY_SCOPE,
  GOOGLE_GMAIL_READONLY_SCOPE,
  GOOGLE_OAUTH_SCOPES,
} from './auth/google-oauth.mjs'
import { MemorySessionStore } from './auth/session-store.mjs'
import {
  ClassroomRequestError,
  extractGoogleFormIdDetails,
} from './classroom/google-classroom.mjs'
import { GmailRequestError } from './gmail/google-gmail.mjs'

const FRONTEND_ORIGIN = 'http://localhost:5173'
const NOW = Date.parse('2026-07-30T08:00:00.000Z')
const FORM_ID = '1FAIpQLSabcdefghijklmnopqrstuvwxyz12345'

function createFakeOAuthService(overrides = {}) {
  return {
    createAuthorizationUrl: vi.fn(
      (state) =>
        `https://accounts.example/authorize?state=${encodeURIComponent(state)}`,
    ),
    exchangeCode: vi.fn(async () => ({
      accessToken: 'access-token',
      expiresAt: NOW + 60 * 60 * 1000,
      grantedScopes: GOOGLE_OAUTH_SCOPES,
    })),
    revokeAccessToken: vi.fn(async () => {}),
    ...overrides,
  }
}

function createFakeClassroomService(overrides = {}) {
  return {
    countActiveCourses: vi.fn(async () => 3),
    listActiveCoursesWithCourseWork: vi.fn(async () => []),
    listActiveCoursesWithItems: vi.fn(async () => []),
    ...overrides,
  }
}

function createFakeGmailService(overrides = {}) {
  return {
    checkConnection: vi.fn(async () => {}),
    checkFormResponse: vi.fn(async () => ({
      status: 'submitted',
      receiptReceivedAt: '2026-08-05T00:00:00.000Z',
    })),
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
  let gmailService
  let logger
  let handler

  beforeEach(() => {
    now = NOW
    oauthService = createFakeOAuthService()
    classroomService = createFakeClassroomService()
    gmailService = createFakeGmailService()
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
      gmailServiceFactory: () => gmailService,
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
    expect(sessionResponse.header('cache-control')).toBe('private, no-store')
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

  it.each([
    '/api/classroom/courses/count',
    '/api/classroom/courses/coursework',
    '/api/gmail/connection',
    `/api/gmail/forms/${FORM_ID}/response`,
  ])('returns session_expired for an expired session at %s', async (url) => {
    const { sessionCookie } = await completeAuthentication()
    now = NOW + 60 * 60 * 1000

    const response = await sendRequest(handler, {
      url,
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(401)
    expect(response.json()).toEqual({
      error: {
        code: 'session_expired',
        message: 'The Google session has expired.',
      },
    })
    expect(response.header('set-cookie')).toContain('Max-Age=0')
  })

  it.each([
    '/api/classroom/courses/count',
    '/api/classroom/courses/coursework',
    '/api/gmail/connection',
    `/api/gmail/forms/${FORM_ID}/response`,
  ])('returns unauthenticated without a session at %s', async (url) => {
    const response = await sendRequest(handler, { url })

    expect(response.status).toBe(401)
    expect(response.json()).toEqual({
      error: {
        code: 'unauthenticated',
        message: 'Authentication is required.',
      },
    })
    expect(response.header('set-cookie')).toContain('Max-Age=0')
    expect(classroomService.countActiveCourses).not.toHaveBeenCalled()
    expect(
      classroomService.listActiveCoursesWithCourseWork,
    ).not.toHaveBeenCalled()
    expect(gmailService.checkConnection).not.toHaveBeenCalled()
    expect(gmailService.checkFormResponse).not.toHaveBeenCalled()
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
    expect(response.header('cache-control')).toBe('private, no-store')
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

  it('does not call Classroom when the courses scope was not granted', async () => {
    oauthService.exchangeCode.mockResolvedValueOnce({
      accessToken: 'access-token',
      expiresAt: NOW + 60 * 60 * 1000,
      grantedScopes: [GOOGLE_GMAIL_READONLY_SCOPE],
    })
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/classroom/courses/count',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(403)
    expect(response.json()).toMatchObject({
      error: { code: 'classroom_scope_missing' },
    })
    expect(classroomService.countActiveCourses).not.toHaveBeenCalled()
    expect(
      (
        await sendRequest(handler, {
          url: '/api/auth/session',
          headers: { cookie: sessionCookie },
        })
      ).json(),
    ).toMatchObject({ authenticated: true })
  })

  it('requires Classroom scopes before listing course work', async () => {
    oauthService.exchangeCode.mockResolvedValueOnce({
      accessToken: 'access-token',
      expiresAt: NOW + 60 * 60 * 1000,
      grantedScopes: [GOOGLE_CLASSROOM_COURSES_READONLY_SCOPE],
    })
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/classroom/courses/coursework',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(403)
    expect(response.json()).toMatchObject({
      error: { code: 'classroom_scope_missing' },
    })
    expect(
      classroomService.listActiveCoursesWithCourseWork,
    ).not.toHaveBeenCalled()
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

  it('returns a generic error when an unexpected service failure occurs', async () => {
    classroomService.countActiveCourses.mockRejectedValueOnce(
      new Error('sensitive classroom response'),
    )
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/classroom/courses/count',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(500)
    expect(response.json()).toEqual({
      error: {
        code: 'internal_error',
        message: 'An unexpected error occurred.',
      },
    })
    expect(response.body).not.toContain('sensitive classroom response')
    expect(logger.error).toHaveBeenCalledWith(
      'Unhandled backend request error.',
    )
  })

  it('returns active courses with their course work and Form IDs to an authenticated user', async () => {
    const courses = [
      {
        id: 'course-1',
        name: '数学',
        courseWork: [
          {
            courseWorkId: 'work-1',
            courseWorkType: 'ASSIGNMENT',
            title: '確認テスト',
            forms: [
              {
                formId: 'form-id',
                formIdType: 'standard',
                formUrl: 'https://docs.google.com/forms/d/form-id/viewform',
              },
            ],
          },
        ],
      },
      {
        id: 'course-2',
        name: '英語',
        courseWork: [],
      },
    ]
    classroomService.listActiveCoursesWithCourseWork.mockResolvedValueOnce(
      courses,
    )
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/classroom/courses/coursework',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(200)
    expect(response.json()).toEqual({ courses })
    expect(
      classroomService.listActiveCoursesWithCourseWork,
    ).toHaveBeenCalledWith('access-token')
  })

  it('accepts the canonical student-submissions scope for course work', async () => {
    oauthService.exchangeCode.mockResolvedValueOnce({
      accessToken: 'access-token',
      expiresAt: NOW + 60 * 60 * 1000,
      grantedScopes: [
        GOOGLE_CLASSROOM_COURSES_READONLY_SCOPE,
        GOOGLE_CLASSROOM_STUDENT_SUBMISSIONS_ME_READONLY_SCOPE,
      ],
    })
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/classroom/courses/coursework',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(200)
    expect(
      classroomService.listActiveCoursesWithCourseWork,
    ).toHaveBeenCalledWith('access-token')
  })

  it('requires authentication before listing Classroom course work', async () => {
    const response = await sendRequest(handler, {
      url: '/api/classroom/courses/coursework',
    })

    expect(response.status).toBe(401)
    expect(response.json()).toMatchObject({
      error: { code: 'unauthenticated' },
    })
    expect(
      classroomService.listActiveCoursesWithCourseWork,
    ).not.toHaveBeenCalled()
  })

  it('returns structured distribution items for an authenticated user', async () => {
    const courses = [
      {
        id: 'course-1',
        name: '数学',
        items: [
          {
            itemId: 'announcement-1',
            itemType: 'announcement',
            title: '連絡',
            creationTime: '2026-08-01T00:00:00Z',
            forms: [
              {
                resolution: 'unresolved',
                sourceUrl: 'https://forms.gle/missing',
              },
            ],
          },
        ],
      },
    ]
    classroomService.listActiveCoursesWithItems.mockResolvedValueOnce(courses)
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/classroom/courses/items',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(200)
    expect(response.json()).toEqual({ courses })
    expect(classroomService.listActiveCoursesWithItems).toHaveBeenCalledWith(
      'access-token',
    )
  })

  it.each([
    GOOGLE_CLASSROOM_COURSES_READONLY_SCOPE,
    GOOGLE_CLASSROOM_COURSEWORK_MATERIALS_READONLY_SCOPE,
    GOOGLE_CLASSROOM_ANNOUNCEMENTS_READONLY_SCOPE,
  ])(
    'rejects /items without the required %s scope and does not call Classroom',
    async (missingScope) => {
      oauthService.exchangeCode.mockResolvedValueOnce({
        accessToken: 'access-token',
        expiresAt: NOW + 60 * 60 * 1000,
        grantedScopes: GOOGLE_OAUTH_SCOPES.filter(
          (scope) => scope !== missingScope,
        ),
      })
      const { sessionCookie } = await completeAuthentication()

      const response = await sendRequest(handler, {
        url: '/api/classroom/courses/items',
        headers: { cookie: sessionCookie },
      })

      expect(response.status).toBe(403)
      expect(response.json()).toMatchObject({
        error: { code: 'classroom_scope_missing' },
      })
      expect(classroomService.listActiveCoursesWithItems).not.toHaveBeenCalled()
    },
  )

  it('accepts the canonical student-submissions scope for /items', async () => {
    oauthService.exchangeCode.mockResolvedValueOnce({
      accessToken: 'access-token',
      expiresAt: NOW + 60 * 60 * 1000,
      grantedScopes: [
        GOOGLE_CLASSROOM_COURSES_READONLY_SCOPE,
        GOOGLE_CLASSROOM_STUDENT_SUBMISSIONS_ME_READONLY_SCOPE,
        GOOGLE_CLASSROOM_COURSEWORK_MATERIALS_READONLY_SCOPE,
        GOOGLE_CLASSROOM_ANNOUNCEMENTS_READONLY_SCOPE,
      ],
    })
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/classroom/courses/items',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(200)
    expect(classroomService.listActiveCoursesWithItems).toHaveBeenCalledWith(
      'access-token',
    )
  })

  it('requires a coursework-compatible scope for /items', async () => {
    oauthService.exchangeCode.mockResolvedValueOnce({
      accessToken: 'access-token',
      expiresAt: NOW + 60 * 60 * 1000,
      grantedScopes: [
        GOOGLE_CLASSROOM_COURSES_READONLY_SCOPE,
        GOOGLE_CLASSROOM_COURSEWORK_MATERIALS_READONLY_SCOPE,
        GOOGLE_CLASSROOM_ANNOUNCEMENTS_READONLY_SCOPE,
      ],
    })
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/classroom/courses/items',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(403)
    expect(response.json()).toMatchObject({
      error: { code: 'classroom_scope_missing' },
    })
    expect(classroomService.listActiveCoursesWithItems).not.toHaveBeenCalled()
  })

  it('maps a Classroom course work permission error safely', async () => {
    classroomService.listActiveCoursesWithCourseWork.mockRejectedValueOnce(
      new ClassroomRequestError('upstream_error', { status: 403 }),
    )
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/classroom/courses/coursework',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(403)
    expect(response.json()).toEqual({
      error: {
        code: 'classroom_forbidden',
        message: 'Google Classroom access was denied.',
      },
    })
  })

  it('confirms Gmail connectivity without returning profile data', async () => {
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/gmail/connection',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(200)
    expect(response.json()).toEqual({ connected: true })
    expect(gmailService.checkConnection).toHaveBeenCalledWith('access-token')
  })

  it('keeps Classroom usable when partial consent omits Gmail', async () => {
    oauthService.exchangeCode.mockResolvedValueOnce({
      accessToken: 'access-token',
      expiresAt: NOW + 60 * 60 * 1000,
      grantedScopes: [
        GOOGLE_CLASSROOM_COURSES_READONLY_SCOPE,
        GOOGLE_CLASSROOM_COURSEWORK_ME_READONLY_SCOPE,
      ],
    })
    const { sessionCookie } = await completeAuthentication()

    const classroomResponse = await sendRequest(handler, {
      url: '/api/classroom/courses/count',
      headers: { cookie: sessionCookie },
    })
    const gmailResponse = await sendRequest(handler, {
      url: '/api/gmail/connection',
      headers: { cookie: sessionCookie },
    })

    expect(classroomResponse.status).toBe(200)
    expect(gmailResponse.status).toBe(403)
    expect(gmailResponse.json()).toEqual({
      error: {
        code: 'gmail_forbidden',
        message: 'Gmail access was denied.',
      },
    })
    expect(gmailService.checkConnection).not.toHaveBeenCalled()
    expect(
      (
        await sendRequest(handler, {
          url: '/api/auth/session',
          headers: { cookie: sessionCookie },
        })
      ).json(),
    ).toMatchObject({ authenticated: true })
  })

  it('does not call Gmail when the Gmail scope was not granted', async () => {
    oauthService.exchangeCode.mockResolvedValueOnce({
      accessToken: 'access-token',
      expiresAt: NOW + 60 * 60 * 1000,
      grantedScopes: [GOOGLE_CLASSROOM_COURSES_READONLY_SCOPE],
    })
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/gmail/connection',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(403)
    expect(response.json()).toMatchObject({
      error: { code: 'gmail_forbidden' },
    })
    expect(gmailService.checkConnection).not.toHaveBeenCalled()
  })

  it('requires authentication before checking Gmail connectivity', async () => {
    const response = await sendRequest(handler, {
      url: '/api/gmail/connection',
    })

    expect(response.status).toBe(401)
    expect(response.json()).toMatchObject({
      error: { code: 'unauthenticated' },
    })
    expect(gmailService.checkConnection).not.toHaveBeenCalled()
  })

  it('maps Gmail permission errors without exposing upstream details', async () => {
    gmailService.checkConnection.mockRejectedValueOnce(
      new GmailRequestError('permission_denied', { status: 403 }),
    )
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/gmail/connection',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(403)
    expect(response.json()).toEqual({
      error: {
        code: 'gmail_forbidden',
        message: 'Gmail access was denied.',
      },
    })
  })

  it('keeps an unclassified Gmail 403 as a generic unavailable error', async () => {
    gmailService.checkConnection.mockRejectedValueOnce(
      new GmailRequestError('upstream_error', { status: 403 }),
    )
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/gmail/connection',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(502)
    expect(response.json()).toEqual({
      error: {
        code: 'gmail_unavailable',
        message: 'Gmail is temporarily unavailable.',
      },
    })
  })

  it('maps Gmail rate limits to a temporary error without treating them as permission errors', async () => {
    gmailService.checkConnection.mockRejectedValueOnce(
      new GmailRequestError('rate_limited', { status: 429 }),
    )
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/gmail/connection',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(503)
    expect(response.header('cache-control')).toBe('private, no-store')
    expect(response.json()).toEqual({
      error: {
        code: 'gmail_rate_limited',
        message: 'Gmail is temporarily rate limited.',
      },
    })
  })

  it('clears the session after a Gmail unauthorized response', async () => {
    gmailService.checkConnection.mockRejectedValueOnce(
      new GmailRequestError('upstream_error', { status: 401 }),
    )
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/gmail/connection',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(401)
    expect(response.json()).toMatchObject({
      error: { code: 'session_expired' },
    })
    expect(response.header('set-cookie')).toContain('Max-Age=0')
  })

  it('maps Gmail network failures to a safe gateway error', async () => {
    gmailService.checkConnection.mockRejectedValueOnce(
      new GmailRequestError('network_error'),
    )
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: '/api/gmail/connection',
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(502)
    expect(response.json()).toEqual({
      error: {
        code: 'gmail_unavailable',
        message: 'Gmail is temporarily unavailable.',
      },
    })
  })

  it('returns only the safe Form response fields with private no-store caching', async () => {
    gmailService.checkFormResponse = vi.fn(async () => ({
      status: 'submitted',
      receiptReceivedAt: '2026-08-05T00:00:00.000Z',
      messageId: 'must-not-be-returned',
    }))
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: `/api/gmail/forms/${FORM_ID}/response`,
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(200)
    expect(response.header('cache-control')).toBe('private, no-store')
    expect(response.json()).toEqual({
      status: 'submitted',
      receiptReceivedAt: '2026-08-05T00:00:00.000Z',
    })
    expect(gmailService.checkFormResponse).toHaveBeenCalledWith(
      'access-token',
      FORM_ID,
    )
  })

  it('supports an authenticated unreviewable Form response', async () => {
    gmailService.checkFormResponse = vi.fn(async () => ({
      status: 'unreviewable',
    }))
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: `/api/gmail/forms/${FORM_ID}/response`,
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(200)
    expect(response.json()).toEqual({ status: 'unreviewable' })
  })

  it('passes the Classroom-produced form-id through the Gmail response contract', async () => {
    const { formId } = extractGoogleFormIdDetails(
      'https://docs.google.com/forms/d/form-id/viewform',
    )
    gmailService.checkFormResponse = vi.fn(async () => ({
      status: 'needsReview',
    }))
    const { sessionCookie } = await completeAuthentication()

    const response = await sendRequest(handler, {
      url: `/api/gmail/forms/${formId}/response`,
      headers: { cookie: sessionCookie },
    })

    expect(response.status).toBe(200)
    expect(gmailService.checkFormResponse).toHaveBeenCalledWith(
      'access-token',
      formId,
    )
  })

  it('normalizes needsReview and rejects non-canonical submitted timestamps', async () => {
    const { sessionCookie } = await completeAuthentication()
    gmailService.checkFormResponse = vi.fn()

    gmailService.checkFormResponse.mockResolvedValueOnce({
      status: 'needsReview',
      messageId: 'must-not-be-returned',
      body: 'secret answer content',
    })
    const reviewResponse = await sendRequest(handler, {
      url: `/api/gmail/forms/${FORM_ID}/response`,
      headers: { cookie: sessionCookie },
    })
    expect(reviewResponse.status).toBe(200)
    expect(reviewResponse.json()).toEqual({ status: 'needsReview' })
    expect(reviewResponse.body).not.toContain('secret')

    for (const receiptReceivedAt of [
      'not-a-date',
      '2026-08-05T00:00:00Z',
      '2026-08-05T00:00:00.000+00:00',
    ]) {
      gmailService.checkFormResponse.mockResolvedValueOnce({
        status: 'submitted',
        receiptReceivedAt,
      })
      const invalidTimestampResponse = await sendRequest(handler, {
        url: `/api/gmail/forms/${FORM_ID}/response`,
        headers: { cookie: sessionCookie },
      })
      expect(invalidTimestampResponse.status).toBe(502)
      expect(invalidTimestampResponse.json()).toMatchObject({
        error: { code: 'gmail_unavailable' },
      })
    }

    gmailService.checkFormResponse.mockResolvedValueOnce({
      status: 'unknown',
      receiptReceivedAt: '2026-08-05T00:00:00.000Z',
    })
    const unknownStatusResponse = await sendRequest(handler, {
      url: `/api/gmail/forms/${FORM_ID}/response`,
      headers: { cookie: sessionCookie },
    })
    expect(unknownStatusResponse.status).toBe(502)
    expect(unknownStatusResponse.json()).toMatchObject({
      error: { code: 'gmail_unavailable' },
    })
  })

  it('requires authentication and Gmail scope before checking a Form response', async () => {
    gmailService.checkFormResponse = vi.fn()
    const unauthenticatedResponse = await sendRequest(handler, {
      url: `/api/gmail/forms/${FORM_ID}/response`,
    })
    expect(unauthenticatedResponse.status).toBe(401)
    expect(gmailService.checkFormResponse).not.toHaveBeenCalled()

    oauthService.exchangeCode.mockResolvedValueOnce({
      accessToken: 'access-token',
      expiresAt: NOW + 60 * 60 * 1000,
      grantedScopes: [GOOGLE_CLASSROOM_COURSES_READONLY_SCOPE],
    })
    const { sessionCookie } = await completeAuthentication()
    const forbiddenResponse = await sendRequest(handler, {
      url: `/api/gmail/forms/${FORM_ID}/response`,
      headers: { cookie: sessionCookie },
    })
    expect(forbiddenResponse.status).toBe(403)
    expect(forbiddenResponse.json()).toMatchObject({
      error: { code: 'gmail_forbidden' },
    })
    expect(gmailService.checkFormResponse).not.toHaveBeenCalled()
  })

  it('rejects invalid IDs and malformed route paths without calling Gmail', async () => {
    gmailService.checkFormResponse = vi.fn()
    const { sessionCookie } = await completeAuthentication()
    for (const url of [
      '/api/gmail/forms/form-id%22%20OR%20from%3Aattacker%40example.com/response',
      '/api/gmail/forms/form%20id/response',
      '/api/gmail/forms/form%2Fid/response',
      `/api/gmail/forms/${'a'.repeat(513)}/response`,
      '/api/gmail/forms/%E0%A4%A/response',
    ]) {
      const response = await sendRequest(handler, {
        url,
        headers: { cookie: sessionCookie },
      })
      expect(response.status).toBe(400)
      expect(response.json()).toMatchObject({
        error: { code: 'invalid_form_id' },
      })
    }

    for (const url of [
      `/api/gmail/forms/${FORM_ID}/response/`,
      `/api/gmail/forms/${FORM_ID}/response/extra`,
      `/api/gmail/forms//response`,
    ]) {
      const response = await sendRequest(handler, {
        url,
        headers: { cookie: sessionCookie },
      })
      expect(response.status).toBe(404)
    }
    expect(gmailService.checkFormResponse).not.toHaveBeenCalled()
  })

  it('maps Form response expiry, permission, rate-limit, and unavailable errors safely', async () => {
    const { sessionCookie } = await completeAuthentication()
    gmailService.checkFormResponse = vi.fn()
    const cases = [
      {
        error: new GmailRequestError('permission_denied', { status: 403 }),
        status: 403,
        code: 'gmail_forbidden',
      },
      {
        error: new GmailRequestError('rate_limited', { status: 429 }),
        status: 503,
        code: 'gmail_rate_limited',
      },
      {
        error: new GmailRequestError('invalid_response', {
          cause: new Error('secret upstream body'),
        }),
        status: 502,
        code: 'gmail_unavailable',
      },
      {
        error: new GmailRequestError('operation_timeout'),
        status: 502,
        code: 'gmail_unavailable',
      },
      {
        error: new GmailRequestError('upstream_error', { status: 401 }),
        status: 401,
        code: 'session_expired',
      },
    ]

    for (const { error, status, code } of cases) {
      gmailService.checkFormResponse.mockRejectedValueOnce(error)
      const response = await sendRequest(handler, {
        url: `/api/gmail/forms/${FORM_ID}/response`,
        headers: { cookie: sessionCookie },
      })
      expect(response.status).toBe(status)
      expect(response.json()).toEqual({
        error: {
          code,
          message:
            code === 'session_expired'
              ? 'The Google session has expired.'
              : code === 'gmail_forbidden'
                ? 'Gmail access was denied.'
                : code === 'gmail_rate_limited'
                  ? 'Gmail is temporarily rate limited.'
                  : 'Gmail is temporarily unavailable.',
        },
      })
      expect(response.body).not.toContain('secret')
      expect(response.body).not.toContain('upstream')
    }
    expect(logger.error).not.toHaveBeenCalled()
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
      url: `/api/gmail/forms/${FORM_ID}/response`,
    })
    expect(unauthenticated.status).toBe(401)

    const { sessionCookie } = await completeAuthentication()
    const authenticated = await sendRequest(handler, {
      method: 'GET',
      url: `/api/gmail/forms/${FORM_ID}/response`,
      headers: { cookie: sessionCookie },
    })
    expect(authenticated.status).toBe(200)
    expect(authenticated.json()).toEqual({
      status: 'submitted',
      receiptReceivedAt: '2026-08-05T00:00:00.000Z',
    })
  })
})

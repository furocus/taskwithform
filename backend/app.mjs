import { randomBytes } from 'node:crypto'

import {
  createGoogleOAuthService,
  GOOGLE_CLASSROOM_COURSES_READONLY_SCOPE,
  GOOGLE_CLASSROOM_COURSEWORK_ME_READONLY_SCOPE,
  GOOGLE_GMAIL_READONLY_SCOPE,
} from './auth/google-oauth.mjs'
import { MemorySessionStore } from './auth/session-store.mjs'
import {
  loadGoogleOAuthConfig,
  loadServerConfig,
  OAuthConfigurationError,
} from './config.mjs'
import {
  ClassroomRequestError,
  createGoogleClassroomService,
} from './classroom/google-classroom.mjs'
import {
  createGoogleGmailService,
  GmailRequestError,
} from './gmail/google-gmail.mjs'
import { isValidGoogleFormId } from './google-form-id.mjs'

const SESSION_COOKIE_NAME = 'taskwithform.sid'
const SESSION_COOKIE_PATH = '/'

function parseCookieHeader(headerValue) {
  if (typeof headerValue !== 'string' || headerValue.length === 0) {
    return new Map()
  }

  const cookies = new Map()
  for (const cookie of headerValue.split(';')) {
    const trimmed = cookie.trim()
    if (trimmed.length === 0) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')
    const name =
      separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex).trim()
    const value =
      separatorIndex === -1 ? '' : trimmed.slice(separatorIndex + 1).trim()
    cookies.set(name, decodeURIComponent(value))
  }

  return cookies
}

function readSessionIdFromRequest(request) {
  const headerValue =
    Array.isArray(request.headers?.cookie) && request.headers.cookie.length > 0
      ? request.headers.cookie.join('; ')
      : request.headers?.cookie

  return parseCookieHeader(headerValue).get(SESSION_COOKIE_NAME)
}

function buildSessionCookie(sessionId, { secure = false, clear = false } = {}) {
  if (clear) {
    return `${SESSION_COOKIE_NAME}=; Path=${SESSION_COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? '; Secure' : ''}`
  }

  return `${SESSION_COOKIE_NAME}=${sessionId}; Path=${SESSION_COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=600${secure ? '; Secure' : ''}`
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store',
    ...extraHeaders,
  })
  response.end(JSON.stringify(payload))
}

function sendRedirect(response, targetUrl, cookieHeader) {
  const headers = { location: targetUrl }
  if (cookieHeader !== undefined) {
    headers['set-cookie'] = cookieHeader
  }

  response.writeHead(302, headers)
  response.end()
}

function ensureAuthenticated(request, sessionStore) {
  const sessionId = readSessionIdFromRequest(request)
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return {
      ok: false,
      status: 401,
      payload: { error: { code: 'unauthenticated' } },
    }
  }

  const session = sessionStore.getAuthenticated(sessionId)
  if (session === undefined) {
    return {
      ok: false,
      status: 401,
      payload: { error: { code: 'unauthenticated' } },
      sessionId,
    }
  }

  return { ok: true, session, sessionId }
}

function hasRequiredScope(session, requiredScope) {
  return Array.isArray(session.grantedScopes)
    ? session.grantedScopes.includes(requiredScope)
    : false
}

function getSessionErrorResponse({ status, code, message, setCookieHeader }) {
  return {
    status,
    payload: { error: { code, message } },
    setCookieHeader,
  }
}

function buildGoogleClassroomErrorResponse(error) {
  if (error instanceof ClassroomRequestError && error.status === 401) {
    return getSessionErrorResponse({
      status: 401,
      code: 'session_expired',
      message: 'The Google session has expired.',
      setCookieHeader: buildSessionCookie('', { clear: true }),
    })
  }

  if (error instanceof ClassroomRequestError && error.status === 403) {
    return getSessionErrorResponse({
      status: 403,
      code: 'classroom_forbidden',
      message: 'Google Classroom access was denied.',
    })
  }

  return getSessionErrorResponse({
    status: 502,
    code: 'classroom_unavailable',
    message: 'Google Classroom is temporarily unavailable.',
  })
}

function buildGmailErrorResponse(error) {
  if (error instanceof GmailRequestError && error.status === 401) {
    return getSessionErrorResponse({
      status: 401,
      code: 'session_expired',
      message: 'The Google session has expired.',
      setCookieHeader: buildSessionCookie('', { clear: true }),
    })
  }

  if (
    error instanceof GmailRequestError &&
    error.code === 'permission_denied'
  ) {
    return getSessionErrorResponse({
      status: 403,
      code: 'gmail_forbidden',
      message: 'Gmail access was denied.',
    })
  }

  if (
    error instanceof GmailRequestError &&
    (error.code === 'rate_limited' || error.status === 429)
  ) {
    return getSessionErrorResponse({
      status: 503,
      code: 'gmail_rate_limited',
      message: 'Gmail is temporarily rate limited.',
    })
  }

  return getSessionErrorResponse({
    status: 502,
    code: 'gmail_unavailable',
    message: 'Gmail is temporarily unavailable.',
  })
}

function clearSessionForExpiredRequest(request, sessionStore) {
  const sessionId = readSessionIdFromRequest(request)
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    sessionStore.delete(sessionId)
  }
}

export function createRequestHandler(options = {}) {
  const environment = options.environment ?? process.env
  const serverConfig = loadServerConfig(environment)
  const sessionStore =
    options.sessionStore ??
    new MemorySessionStore({ now: options.now ?? Date.now })
  const stateFactory =
    options.stateFactory ?? (() => randomBytes(32).toString('base64url'))
  const logger = options.logger ?? console
  const oauthServiceFactory =
    options.oauthServiceFactory ??
    (() => {
      const config = loadGoogleOAuthConfig(environment)
      return createGoogleOAuthService(config)
    })
  const classroomServiceFactory =
    options.classroomServiceFactory ?? (() => createGoogleClassroomService())
  const gmailServiceFactory =
    options.gmailServiceFactory ?? (() => createGoogleGmailService())

  return async function handleRequest(request, response) {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost')
    const method = (request.method ?? 'GET').toUpperCase()
    const pathname = requestUrl.pathname

    if (method === 'GET' && pathname === '/api/health') {
      return sendJson(response, 200, { status: 'ok' })
    }

    if (method === 'GET' && pathname === '/api/auth/google') {
      try {
        const sessionState = stateFactory()
        const sessionId = sessionStore.createPending(sessionState)
        const oauthService = oauthServiceFactory()
        const authUrl = oauthService.createAuthorizationUrl(sessionState)
        const secureCookie = environment.NODE_ENV === 'production'
        const setCookie = buildSessionCookie(sessionId, {
          secure: secureCookie,
        })

        return sendRedirect(response, authUrl, setCookie)
      } catch (error) {
        if (error instanceof OAuthConfigurationError) {
          return sendJson(response, 503, {
            error: {
              code: 'oauth_not_configured',
              message: 'Google OAuth is not configured.',
            },
          })
        }

        throw error
      }
    }

    if (method === 'GET' && pathname === '/api/auth/google/callback') {
      const sessionId = readSessionIdFromRequest(request)
      const errorValue = requestUrl.searchParams.get('error')
      const code = requestUrl.searchParams.get('code')
      const state = requestUrl.searchParams.get('state')
      const clearCookie = buildSessionCookie('', {
        clear: true,
        secure: environment.NODE_ENV === 'production',
      })

      if (errorValue === 'access_denied') {
        return sendRedirect(
          response,
          `${serverConfig.frontendOrigin}/login?error=access_denied`,
          clearCookie,
        )
      }

      if (
        typeof sessionId !== 'string' ||
        typeof state !== 'string' ||
        !sessionStore.consumePending(sessionId, state)
      ) {
        return sendRedirect(
          response,
          `${serverConfig.frontendOrigin}/login?error=invalid_state`,
          clearCookie,
        )
      }

      if (typeof code !== 'string' || code.length === 0) {
        return sendRedirect(
          response,
          `${serverConfig.frontendOrigin}/login?error=invalid_state`,
          clearCookie,
        )
      }

      try {
        const oauthService = oauthServiceFactory()
        const session = await oauthService.exchangeCode(code)
        const authenticatedSessionId = sessionStore.createAuthenticated(session)
        const secureCookie = environment.NODE_ENV === 'production'
        const setCookie = buildSessionCookie(authenticatedSessionId, {
          secure: secureCookie,
        })

        return sendRedirect(
          response,
          `${serverConfig.frontendOrigin}/`,
          setCookie,
        )
      } catch {
        return sendRedirect(
          response,
          `${serverConfig.frontendOrigin}/login?error=oauth_failed`,
          clearCookie,
        )
      }
    }

    if (method === 'GET' && pathname === '/api/auth/session') {
      const sessionId = readSessionIdFromRequest(request)
      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        return sendJson(response, 200, { authenticated: false })
      }

      const authenticatedSession = sessionStore.getAuthenticated(sessionId)
      if (authenticatedSession === undefined) {
        return sendJson(
          response,
          200,
          { authenticated: false },
          {
            'set-cookie': buildSessionCookie('', {
              clear: true,
              secure: environment.NODE_ENV === 'production',
            }),
          },
        )
      }

      return sendJson(response, 200, {
        authenticated: true,
        expiresAt: new Date(authenticatedSession.expiresAt).toISOString(),
      })
    }

    if (method === 'POST' && pathname === '/api/auth/logout') {
      const originHeader = request.headers?.origin
      if (
        typeof originHeader === 'string' &&
        originHeader !== serverConfig.frontendOrigin
      ) {
        return sendJson(response, 403, { error: { code: 'invalid_origin' } })
      }

      const sessionId = readSessionIdFromRequest(request)
      const clearCookie = buildSessionCookie('', {
        clear: true,
        secure: environment.NODE_ENV === 'production',
      })

      if (typeof sessionId === 'string' && sessionId.length > 0) {
        const authenticatedSession = sessionStore.getAuthenticated(sessionId)
        if (authenticatedSession !== undefined) {
          try {
            const oauthService = oauthServiceFactory()
            await oauthService.revokeAccessToken(
              authenticatedSession.accessToken,
            )
          } catch {
            logger.warn?.('Google access token revocation failed.')
          }
        }

        sessionStore.delete(sessionId)
      }

      response.writeHead(204, {
        'set-cookie': clearCookie,
      })
      response.end()
      return
    }

    if (method === 'GET' && pathname === '/api/classroom/courses/count') {
      const authState = ensureAuthenticated(request, sessionStore)
      if (!authState.ok) {
        return sendJson(response, authState.status, authState.payload)
      }

      if (
        !hasRequiredScope(
          authState.session,
          GOOGLE_CLASSROOM_COURSES_READONLY_SCOPE,
        )
      ) {
        return sendJson(response, 403, {
          error: {
            code: 'classroom_forbidden',
            message: 'Google Classroom access was denied.',
          },
        })
      }

      try {
        const classroomService = classroomServiceFactory()
        const count = await classroomService.countActiveCourses(
          authState.session.accessToken,
        )
        return sendJson(response, 200, { count })
      } catch (error) {
        const result = buildGoogleClassroomErrorResponse(error)
        if (result.status === 401) {
          clearSessionForExpiredRequest(request, sessionStore)
        }
        const headers = result.setCookieHeader
          ? { 'set-cookie': result.setCookieHeader }
          : undefined
        return sendJson(response, result.status, result.payload, headers)
      }
    }

    if (method === 'GET' && pathname === '/api/classroom/coursework/forms') {
      const authState = ensureAuthenticated(request, sessionStore)
      if (!authState.ok) {
        return sendJson(response, authState.status, authState.payload)
      }

      if (
        !hasRequiredScope(
          authState.session,
          GOOGLE_CLASSROOM_COURSES_READONLY_SCOPE,
        ) ||
        !hasRequiredScope(
          authState.session,
          GOOGLE_CLASSROOM_COURSEWORK_ME_READONLY_SCOPE,
        )
      ) {
        return sendJson(response, 403, {
          error: {
            code: 'classroom_forbidden',
            message: 'Google Classroom access was denied.',
          },
        })
      }

      try {
        const classroomService = classroomServiceFactory()
        const courseWork = await classroomService.listCourseWorkWithForms(
          authState.session.accessToken,
        )
        return sendJson(response, 200, { courseWork })
      } catch (error) {
        const result = buildGoogleClassroomErrorResponse(error)
        if (result.status === 401) {
          clearSessionForExpiredRequest(request, sessionStore)
        }
        const headers = result.setCookieHeader
          ? { 'set-cookie': result.setCookieHeader }
          : undefined
        return sendJson(response, result.status, result.payload, headers)
      }
    }

    if (method === 'GET' && pathname === '/api/gmail/connection') {
      const authState = ensureAuthenticated(request, sessionStore)
      if (!authState.ok) {
        return sendJson(response, authState.status, authState.payload)
      }

      if (!hasRequiredScope(authState.session, GOOGLE_GMAIL_READONLY_SCOPE)) {
        return sendJson(response, 403, {
          error: {
            code: 'gmail_forbidden',
            message: 'Gmail access was denied.',
          },
        })
      }

      try {
        const gmailService = gmailServiceFactory()
        await gmailService.checkConnection(authState.session.accessToken)
        return sendJson(response, 200, { connected: true })
      } catch (error) {
        const result = buildGmailErrorResponse(error)
        if (result.status === 401) {
          clearSessionForExpiredRequest(request, sessionStore)
        }
        const headers = result.setCookieHeader
          ? { 'set-cookie': result.setCookieHeader }
          : undefined
        return sendJson(response, result.status, result.payload, headers)
      }
    }

    if (pathname.startsWith('/api/gmail/forms/')) {
      const formResponseMatch = pathname.match(
        /^\/api\/gmail\/forms\/([^/]+)\/response$/,
      )
      if (formResponseMatch === null) {
        if (pathname === '/api/gmail/forms') {
          return sendJson(response, 404, { error: { code: 'not_found' } })
        }
        return sendJson(response, 404, { error: { code: 'not_found' } })
      }

      const formId = formResponseMatch[1]
      if (!isValidGoogleFormId(formId)) {
        return sendJson(response, 400, { error: { code: 'invalid_form_id' } })
      }

      if (method !== 'GET') {
        return sendJson(response, 404, { error: { code: 'not_found' } })
      }

      const authState = ensureAuthenticated(request, sessionStore)
      if (!authState.ok) {
        return sendJson(response, authState.status, authState.payload)
      }

      if (!hasRequiredScope(authState.session, GOOGLE_GMAIL_READONLY_SCOPE)) {
        return sendJson(response, 403, {
          error: {
            code: 'gmail_forbidden',
            message: 'Gmail access was denied.',
          },
        })
      }

      try {
        const gmailService = gmailServiceFactory()
        const result = await gmailService.checkFormResponse(
          authState.session.accessToken,
          formId,
        )

        const payload = {}
        const allowedStatuses = new Set([
          'submitted',
          'unreviewable',
          'needsReview',
        ])

        if (
          typeof result?.status !== 'string' ||
          !allowedStatuses.has(result.status)
        ) {
          throw new GmailRequestError('invalid_response')
        }

        payload.status = result.status

        if (result.status === 'submitted') {
          const receiptReceivedAt = result.receiptReceivedAt
          if (
            typeof receiptReceivedAt !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
              receiptReceivedAt,
            )
          ) {
            throw new GmailRequestError('invalid_response')
          }
          payload.receiptReceivedAt = receiptReceivedAt
        }

        return sendJson(response, 200, payload)
      } catch (error) {
        const result = buildGmailErrorResponse(error)
        if (result.status === 401) {
          clearSessionForExpiredRequest(request, sessionStore)
        }
        const headers = result.setCookieHeader
          ? { 'set-cookie': result.setCookieHeader }
          : undefined
        return sendJson(response, result.status, result.payload, headers)
      }
    }

    response.writeHead(404)
    response.end()
  }
}

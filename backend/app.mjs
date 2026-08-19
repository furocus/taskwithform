import { randomBytes } from 'node:crypto'

import {
  OAuthConfigurationError,
  loadGoogleOAuthConfig,
  loadServerConfig,
} from './config.mjs'
import { createGoogleOAuthService } from './auth/google-oauth.mjs'
import { MemorySessionStore } from './auth/session-store.mjs'
import {
  ClassroomRequestError,
  createGoogleClassroomService,
} from './classroom/google-classroom.mjs'

const SESSION_COOKIE_NAME = 'taskwithform.sid'
const PENDING_SESSION_MAX_AGE_SECONDS = 10 * 60

function createState() {
  return randomBytes(32).toString('base64url')
}

function safelyDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separatorIndex = cookie.indexOf('=')
        if (separatorIndex === -1) {
          return [cookie, '']
        }

        return [
          cookie.slice(0, separatorIndex),
          safelyDecodeURIComponent(cookie.slice(separatorIndex + 1)),
        ]
      }),
  )
}

function serializeSessionCookie(
  sessionId,
  { maxAgeSeconds, secure = false } = {},
) {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
  ]

  if (maxAgeSeconds !== undefined) {
    attributes.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`)
  }

  if (secure) {
    attributes.push('Secure')
  }

  return attributes.join('; ')
}

function clearSessionCookie(secure) {
  return serializeSessionCookie('', { maxAgeSeconds: 0, secure })
}

function sendJson(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  })
  response.end(JSON.stringify(body))
}

function redirect(response, location, headers = {}) {
  response.writeHead(302, { Location: location, ...headers })
  response.end()
}

function createFrontendLocation(frontendOrigin, path, errorCode) {
  const location = new URL(path, frontendOrigin)
  if (errorCode !== undefined) {
    location.searchParams.set('error', errorCode)
  }
  return location.toString()
}

export function createRequestHandler({
  environment = process.env,
  now = () => Date.now(),
  stateFactory = createState,
  sessionStore = new MemorySessionStore({ now }),
  oauthServiceFactory = createGoogleOAuthService,
  classroomServiceFactory = createGoogleClassroomService,
  logger = console,
} = {}) {
  const serverConfig = loadServerConfig(environment)
  const secureCookie = environment.NODE_ENV === 'production'
  let oauthService
  let classroomService

  function getOAuthService() {
    oauthService ??= oauthServiceFactory(loadGoogleOAuthConfig(environment))
    return oauthService
  }

  function getClassroomService() {
    classroomService ??= classroomServiceFactory()
    return classroomService
  }

  function readSessionId(request) {
    return parseCookies(request.headers.cookie)[SESSION_COOKIE_NAME]
  }

  return async function handleRequest(request, response) {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://localhost')

      if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
        sendJson(response, 200, { status: 'ok' })
        return
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/api/auth/google'
      ) {
        let authorizationUrl

        try {
          const service = getOAuthService()
          const state = stateFactory()
          const sessionId = sessionStore.createPending(state)
          authorizationUrl = service.createAuthorizationUrl(state)
          redirect(response, authorizationUrl, {
            'Set-Cookie': serializeSessionCookie(sessionId, {
              maxAgeSeconds: PENDING_SESSION_MAX_AGE_SECONDS,
              secure: secureCookie,
            }),
          })
        } catch (error) {
          if (error instanceof OAuthConfigurationError) {
            sendJson(response, 503, {
              error: {
                code: 'oauth_not_configured',
                message: 'Google OAuth is not configured.',
              },
            })
            return
          }
          throw error
        }
        return
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/api/auth/google/callback'
      ) {
        const sessionId = readSessionId(request)
        const state = requestUrl.searchParams.get('state')
        const validState =
          sessionId !== undefined &&
          state !== null &&
          sessionStore.consumePending(sessionId, state)

        if (!validState) {
          redirect(
            response,
            createFrontendLocation(
              serverConfig.frontendOrigin,
              '/login',
              'invalid_state',
            ),
            { 'Set-Cookie': clearSessionCookie(secureCookie) },
          )
          return
        }

        if (requestUrl.searchParams.get('error') === 'access_denied') {
          redirect(
            response,
            createFrontendLocation(
              serverConfig.frontendOrigin,
              '/login',
              'access_denied',
            ),
            { 'Set-Cookie': clearSessionCookie(secureCookie) },
          )
          return
        }

        const code = requestUrl.searchParams.get('code')
        if (code === null) {
          redirect(
            response,
            createFrontendLocation(
              serverConfig.frontendOrigin,
              '/login',
              'oauth_failed',
            ),
            { 'Set-Cookie': clearSessionCookie(secureCookie) },
          )
          return
        }

        try {
          const credentials = await getOAuthService().exchangeCode(code)
          if (
            credentials.accessToken === undefined ||
            credentials.expiresAt === undefined ||
            credentials.expiresAt <= now()
          ) {
            throw new Error('Google returned invalid access credentials.')
          }

          const authenticatedSessionId =
            sessionStore.createAuthenticated(credentials)
          redirect(
            response,
            createFrontendLocation(serverConfig.frontendOrigin, '/'),
            {
              'Set-Cookie': serializeSessionCookie(authenticatedSessionId, {
                maxAgeSeconds: (credentials.expiresAt - now()) / 1000,
                secure: secureCookie,
              }),
            },
          )
        } catch {
          redirect(
            response,
            createFrontendLocation(
              serverConfig.frontendOrigin,
              '/login',
              'oauth_failed',
            ),
            { 'Set-Cookie': clearSessionCookie(secureCookie) },
          )
        }
        return
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/api/auth/session'
      ) {
        const sessionId = readSessionId(request)
        const session =
          sessionId === undefined
            ? undefined
            : sessionStore.getAuthenticated(sessionId)

        if (session === undefined) {
          sendJson(
            response,
            200,
            { authenticated: false },
            { 'Set-Cookie': clearSessionCookie(secureCookie) },
          )
          return
        }

        sendJson(response, 200, {
          authenticated: true,
          expiresAt: new Date(session.expiresAt).toISOString(),
        })
        return
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/api/classroom/courses/count'
      ) {
        const sessionId = readSessionId(request)
        const session =
          sessionId === undefined
            ? undefined
            : sessionStore.getAuthenticated(sessionId)

        if (session === undefined) {
          sendJson(
            response,
            401,
            {
              error: {
                code: 'unauthenticated',
                message: 'Authentication is required.',
              },
            },
            { 'Set-Cookie': clearSessionCookie(secureCookie) },
          )
          return
        }

        try {
          const count = await getClassroomService().countActiveCourses(
            session.accessToken,
          )
          sendJson(response, 200, { count })
        } catch (error) {
          if (error instanceof ClassroomRequestError && error.status === 401) {
            sessionStore.delete(sessionId)
            sendJson(
              response,
              401,
              {
                error: {
                  code: 'session_expired',
                  message: 'The Google session has expired.',
                },
              },
              { 'Set-Cookie': clearSessionCookie(secureCookie) },
            )
            return
          }

          if (error instanceof ClassroomRequestError && error.status === 403) {
            sendJson(response, 403, {
              error: {
                code: 'classroom_forbidden',
                message: 'Google Classroom access was denied.',
              },
            })
            return
          }

          if (error instanceof ClassroomRequestError) {
            sendJson(response, 502, {
              error: {
                code: 'classroom_unavailable',
                message: 'Google Classroom is temporarily unavailable.',
              },
            })
            return
          }

          throw error
        }
        return
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname.startsWith('/api/gmail/forms/') &&
        requestUrl.pathname.endsWith('/response')
      ) {
        const sessionId = readSessionId(request)
        const session =
          sessionId === undefined
            ? undefined
            : sessionStore.getAuthenticated(sessionId)

        if (session === undefined) {
          sendJson(
            response,
            401,
            {
              error: {
                code: 'session_expired',
                message: 'Authentication is required.',
              },
            },
            { 'Set-Cookie': clearSessionCookie(secureCookie) },
          )
          return
        }

        const pathParts = requestUrl.pathname.split('/')
        const formId = decodeURIComponent(pathParts[4] ?? '')

        let status = 'submitted'
        if (formId.includes('needs')) {
          status = 'needsReview'
        } else if (formId.includes('unreviewable')) {
          status = 'unreviewable'
        }

        sendJson(response, 200, {
          formId,
          status,
        })
        return
      }

      if (
        request.method === 'POST' &&
        requestUrl.pathname === '/api/auth/logout'
      ) {
        if (request.headers.origin !== serverConfig.frontendOrigin) {
          sendJson(response, 403, {
            error: {
              code: 'invalid_origin',
              message: 'The request origin is not allowed.',
            },
          })
          return
        }

        const sessionId = readSessionId(request)
        const session =
          sessionId === undefined
            ? undefined
            : sessionStore.getAuthenticated(sessionId)

        if (session !== undefined) {
          try {
            await getOAuthService().revokeAccessToken(session.accessToken)
          } catch {
            logger.warn('Google access token revocation failed.')
          }
        }

        if (sessionId !== undefined) {
          sessionStore.delete(sessionId)
        }

        response.writeHead(204, {
          'Set-Cookie': clearSessionCookie(secureCookie),
        })
        response.end()
        return
      }

      response.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
      })
      response.end('Not Found')
    } catch {
      logger.error('Unhandled backend request error.')
      sendJson(response, 500, {
        error: {
          code: 'internal_error',
          message: 'An unexpected error occurred.',
        },
      })
    }
  }
}

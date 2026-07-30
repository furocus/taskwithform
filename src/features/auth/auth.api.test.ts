import { describe, expect, it, vi } from 'vitest'

import {
  BackendApiError,
  getAuthSession,
  getClassroomCourseCount,
  logoutSession,
} from './auth.api'

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('authentication API client', () => {
  it('returns an authenticated session with its expiry', async () => {
    const fetchImplementation = vi.fn(async () =>
      createJsonResponse({
        authenticated: true,
        expiresAt: '2026-07-30T09:00:00.000Z',
      }),
    )

    await expect(getAuthSession(fetchImplementation)).resolves.toEqual({
      authenticated: true,
      expiresAt: '2026-07-30T09:00:00.000Z',
    })
    expect(fetchImplementation).toHaveBeenCalledWith('/api/auth/session', {
      credentials: 'same-origin',
    })
  })

  it('rejects an invalid session response', async () => {
    const fetchImplementation = vi.fn(async () =>
      createJsonResponse({ authenticated: 'yes' }),
    )

    await expect(getAuthSession(fetchImplementation)).rejects.toMatchObject({
      name: 'BackendApiError',
      code: 'invalid_backend_response',
    })
  })

  it('returns the Classroom course count', async () => {
    const fetchImplementation = vi.fn(async () =>
      createJsonResponse({ count: 3 }),
    )

    await expect(getClassroomCourseCount(fetchImplementation)).resolves.toBe(3)
  })

  it('rejects a negative or fractional course count', async () => {
    for (const count of [-1, 1.5]) {
      const fetchImplementation = vi.fn(async () =>
        createJsonResponse({ count }),
      )

      await expect(
        getClassroomCourseCount(fetchImplementation),
      ).rejects.toBeInstanceOf(BackendApiError)
    }
  })

  it('preserves a safe backend error code', async () => {
    const fetchImplementation = vi.fn(async () =>
      createJsonResponse(
        {
          error: {
            code: 'session_expired',
            message: 'Details are not used by the UI client.',
          },
        },
        401,
      ),
    )

    await expect(
      getClassroomCourseCount(fetchImplementation),
    ).rejects.toMatchObject({
      code: 'session_expired',
      status: 401,
    })
  })

  it('posts logout without sending a request body', async () => {
    const fetchImplementation = vi.fn(
      async () => new Response(null, { status: 204 }),
    )

    await expect(logoutSession(fetchImplementation)).resolves.toBeUndefined()
    expect(fetchImplementation).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    })
  })
})

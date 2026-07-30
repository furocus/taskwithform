import { describe, expect, it, vi } from 'vitest'

import {
  ClassroomRequestError,
  createGoogleClassroomService,
} from './google-classroom.mjs'

function createJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
  }
}

describe('Google Classroom service', () => {
  it('counts active courses across every response page', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          courses: [{ id: 'course-1' }, { id: 'course-2' }],
          nextPageToken: 'next-page',
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          courses: [{ id: 'course-3' }],
        }),
      )
    const service = createGoogleClassroomService({
      fetchImplementation,
    })

    await expect(service.countActiveCourses('access-token')).resolves.toBe(3)

    expect(fetchImplementation).toHaveBeenCalledTimes(2)
    for (const [requestUrl, requestOptions] of fetchImplementation.mock.calls) {
      expect(requestUrl.searchParams.get('courseStates')).toBe('ACTIVE')
      expect(requestUrl.searchParams.get('fields')).toBe(
        'nextPageToken,courses(id)',
      )
      expect(requestOptions.headers.Authorization).toBe('Bearer access-token')
    }
    expect(
      fetchImplementation.mock.calls[1][0].searchParams.get('pageToken'),
    ).toBe('next-page')
  })

  it('returns zero when Google omits the courses field', async () => {
    const service = createGoogleClassroomService({
      fetchImplementation: vi.fn(async () => createJsonResponse({})),
    })

    await expect(service.countActiveCourses('access-token')).resolves.toBe(0)
  })

  it('preserves an upstream HTTP status without reading its body', async () => {
    const response = createJsonResponse({ sensitiveDetails: 'not-read' }, 403)
    const service = createGoogleClassroomService({
      fetchImplementation: vi.fn(async () => response),
    })

    await expect(
      service.countActiveCourses('access-token'),
    ).rejects.toMatchObject({
      name: 'ClassroomRequestError',
      code: 'upstream_error',
      status: 403,
    })
    expect(response.json).not.toHaveBeenCalled()
  })

  it('wraps network failures without exposing their message', async () => {
    const service = createGoogleClassroomService({
      fetchImplementation: vi.fn(async () => {
        throw new Error('sensitive network details')
      }),
    })

    await expect(service.countActiveCourses('access-token')).rejects.toEqual(
      expect.objectContaining({
        name: 'ClassroomRequestError',
        code: 'network_error',
        message: 'Google Classroom request failed.',
      }),
    )
  })

  it('rejects an unexpected response shape', async () => {
    const service = createGoogleClassroomService({
      fetchImplementation: vi.fn(async () =>
        createJsonResponse({ courses: { id: 'not-an-array' } }),
      ),
    })

    await expect(
      service.countActiveCourses('access-token'),
    ).rejects.toMatchObject({
      name: 'ClassroomRequestError',
      code: 'invalid_response',
    })
  })

  it('rejects a repeated page token instead of looping forever', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({ nextPageToken: 'repeated-page' }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({ nextPageToken: 'repeated-page' }),
      )
    const service = createGoogleClassroomService({
      fetchImplementation,
    })

    await expect(
      service.countActiveCourses('access-token'),
    ).rejects.toBeInstanceOf(ClassroomRequestError)
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
  })
})

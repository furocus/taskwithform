import { describe, expect, it, vi } from 'vitest'

import {
  ClassroomRequestError,
  createGoogleClassroomService,
  extractGoogleFormId,
  extractGoogleFormIdDetails,
} from './google-classroom.mjs'

function createJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
  }
}

function createRedirectResponse(location, status = 302) {
  return {
    ok: false,
    status,
    headers: new Headers({ location }),
    json: vi.fn(async () => ({})),
  }
}

describe('Google Classroom service', () => {
  it.each([
    ['https://docs.google.com/forms/d/form-id/edit', 'form-id'],
    [
      'https://docs.google.com/forms/d/e/published-form-id/viewform?usp=sharing',
      'published-form-id',
    ],
  ])('extracts a Form ID from %s', (formUrl, expectedFormId) => {
    expect(extractGoogleFormId(formUrl)).toBe(expectedFormId)
  })

  it('returns the URL identifier and whether a Form URL is standard or published', () => {
    expect(
      extractGoogleFormIdDetails(
        'https://docs.google.com/forms/d/form-id/viewform',
      ),
    ).toEqual({ formId: 'form-id', formIdType: 'standard' })
    expect(
      extractGoogleFormIdDetails(
        'https://docs.google.com/forms/d/e/published-form-id/viewform',
      ),
    ).toEqual({ formId: 'published-form-id', formIdType: 'published' })
  })

  it.each([
    'http://docs.google.com/forms/d/form-id/edit',
    'https://docs.google.com/forms/d/e/viewform',
    'https://docs.google.com/forms/d/edit',
    'https://docs.google.com/forms/d/e/viewform',
    'https://docs.google.com/forms/d/form-id/unknown-action',
    'https://docs.google.com/forms/d/e/published-form-id/edit',
    'https://docs.google.com/forms/d/form-id/edit/extra-segment',
  ])('rejects an unrecognized Form URL shape: %s', (formUrl) => {
    expect(() => extractGoogleFormId(formUrl)).toThrowError(
      expect.objectContaining({
        name: 'ClassroomRequestError',
        code: 'invalid_response',
      }),
    )
  })

  it.each([
    'https://docs.google.com/forms/d/form%20id/viewform',
    'https://docs.google.com/forms/d/form.id/viewform',
    `https://docs.google.com/forms/d/${'a'.repeat(513)}/viewform`,
  ])(
    'rejects a Form ID outside the shared opaque ID contract: %s',
    (formUrl) => {
      expect(() => extractGoogleFormId(formUrl)).toThrowError(
        expect.objectContaining({
          name: 'ClassroomRequestError',
          code: 'invalid_response',
        }),
      )
    },
  )

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

  it('lists published course work and extracts attached Form IDs across pages', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          courses: [{ id: 'course/1', name: '数学' }],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          courseWork: [
            {
              id: 'work-1',
              title: '確認テスト',
              description: 'Google Formに回答してください。',
              alternateLink: 'https://classroom.google.com/example',
              dueDate: { year: 2026, month: 8, day: 9 },
              workType: 'ASSIGNMENT',
              materials: [
                {
                  form: {
                    formUrl:
                      'https://docs.google.com/forms/d/e/published-id/viewform',
                  },
                },
                {},
              ],
            },
          ],
          nextPageToken: 'course-work-page-2',
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          courseWork: [
            {
              id: 'work-2',
              title: '資料確認',
              workType: 'ASSIGNMENT',
            },
          ],
        }),
      )
    const service = createGoogleClassroomService({ fetchImplementation })

    await expect(
      service.listActiveCoursesWithCourseWork('access-token'),
    ).resolves.toEqual([
      {
        id: 'course/1',
        name: '数学',
        courseWork: [
          {
            courseWorkId: 'work-1',
            courseWorkType: 'ASSIGNMENT',
            title: '確認テスト',
            description: 'Google Formに回答してください。',
            alternateLink: 'https://classroom.google.com/example',
            dueDate: '2026-08-09',
            forms: [
              {
                formId: 'published-id',
                formIdType: 'published',
                formUrl:
                  'https://docs.google.com/forms/d/e/published-id/viewform',
              },
            ],
          },
          {
            courseWorkId: 'work-2',
            courseWorkType: 'ASSIGNMENT',
            title: '資料確認',
            forms: [],
          },
        ],
      },
    ])

    expect(fetchImplementation).toHaveBeenCalledTimes(3)
    const courseRequestUrl = fetchImplementation.mock.calls[0][0]
    expect(courseRequestUrl.searchParams.get('courseStates')).toBe('ACTIVE')
    expect(courseRequestUrl.searchParams.get('studentId')).toBe('me')
    expect(courseRequestUrl.searchParams.get('fields')).toBe(
      'nextPageToken,courses(id,name)',
    )

    const firstCourseWorkUrl = fetchImplementation.mock.calls[1][0]
    expect(firstCourseWorkUrl.pathname).toBe(
      '/v1/courses/course%2F1/courseWork',
    )
    expect(firstCourseWorkUrl.searchParams.get('courseWorkStates')).toBe(
      'PUBLISHED',
    )
    expect(firstCourseWorkUrl.searchParams.get('fields')).not.toContain(
      'responseUrl',
    )
    expect(
      fetchImplementation.mock.calls[2][0].searchParams.get('pageToken'),
    ).toBe('course-work-page-2')
  })

  it('requests only courses where the current user is a student', async () => {
    const fetchImplementation = vi.fn(async (requestUrl) => {
      if (requestUrl.pathname === '/v1/courses') {
        if (requestUrl.searchParams.get('studentId') === 'me') {
          return createJsonResponse({
            courses: [{ id: 'student-course', name: '数学' }],
          })
        }

        return createJsonResponse({
          courses: [
            { id: 'teacher-course', name: '担当授業' },
            { id: 'student-course', name: '数学' },
          ],
        })
      }

      if (requestUrl.pathname.includes('teacher-course')) {
        return createJsonResponse({}, 403)
      }

      return createJsonResponse({
        courseWork: [
          {
            id: 'work-1',
            title: '確認テスト',
            workType: 'ASSIGNMENT',
          },
        ],
      })
    })
    const service = createGoogleClassroomService({ fetchImplementation })

    await expect(
      service.listActiveCoursesWithCourseWork('access-token'),
    ).resolves.toEqual([
      {
        id: 'student-course',
        name: '数学',
        courseWork: [
          {
            courseWorkId: 'work-1',
            courseWorkType: 'ASSIGNMENT',
            title: '確認テスト',
            forms: [],
          },
        ],
      },
    ])
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
    expect(
      fetchImplementation.mock.calls.some(([requestUrl]) =>
        requestUrl.pathname.includes('teacher-course'),
      ),
    ).toBe(false)
  })

  it('keeps an active course that has no published course work', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          courses: [
            { id: 'course-1', name: '数学' },
            { id: 'course-2', name: '英語' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          courseWork: [
            {
              id: 'work-1',
              title: '確認テスト',
              workType: 'ASSIGNMENT',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(createJsonResponse({}))
    const service = createGoogleClassroomService({ fetchImplementation })

    await expect(
      service.listActiveCoursesWithCourseWork('access-token'),
    ).resolves.toEqual([
      {
        id: 'course-1',
        name: '数学',
        courseWork: [
          {
            courseWorkId: 'work-1',
            courseWorkType: 'ASSIGNMENT',
            title: '確認テスト',
            forms: [],
          },
        ],
      },
      {
        id: 'course-2',
        name: '英語',
        courseWork: [],
      },
    ])
  })

  it('rejects an unrecognized Form URL instead of returning an incorrect ID', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({ courses: [{ id: 'course-1', name: '数学' }] }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          courseWork: [
            {
              id: 'work-1',
              title: '確認テスト',
              workType: 'ASSIGNMENT',
              materials: [
                { form: { formUrl: 'https://forms.example/form-id' } },
              ],
            },
          ],
        }),
      )
    const service = createGoogleClassroomService({ fetchImplementation })

    await expect(
      service.listActiveCoursesWithCourseWork('access-token'),
    ).rejects.toMatchObject({ code: 'invalid_response' })
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

  it('aborts a stalled request and maps it to a network failure', async () => {
    const fetchImplementation = vi.fn(
      (_requestUrl, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          })
        }),
    )
    const service = createGoogleClassroomService({
      fetchImplementation,
      requestTimeoutMs: 1,
    })

    await expect(service.countActiveCourses('access-token')).rejects.toEqual(
      expect.objectContaining({
        name: 'ClassroomRequestError',
        code: 'network_error',
        message: 'Google Classroom request failed.',
      }),
    )
    expect(fetchImplementation.mock.calls[0][1].signal.aborted).toBe(true)
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

  it('combines published course work, materials, and announcements', async () => {
    const fetchImplementation = vi.fn(async (requestUrl) => {
      if (requestUrl.pathname === '/v1/courses') {
        return createJsonResponse({
          courses: [{ id: 'course-1', name: '数学' }],
        })
      }
      if (requestUrl.pathname.endsWith('/courseWork')) {
        return createJsonResponse({
          courseWork: [
            {
              id: 'work-1',
              title: '課題',
              workType: 'ASSIGNMENT',
              creationTime: '2026-08-01T00:00:00Z',
              state: 'PUBLISHED',
              description: 'https://docs.google.com/forms/d/form-1/viewform',
            },
            {
              id: 'draft',
              title: '下書き',
              workType: 'ASSIGNMENT',
              creationTime: '2026-08-01T00:00:00Z',
              state: 'DRAFT',
            },
          ],
        })
      }
      if (requestUrl.pathname.endsWith('/courseWorkMaterials')) {
        return createJsonResponse({
          courseWorkMaterial: [
            {
              id: 'material-1',
              title: '資料',
              creationTime: '2026-08-02T00:00:00Z',
              materials: [
                { link: { url: 'https://forms.gle/material-short' } },
              ],
            },
            {
              id: 'material-without-form',
              title: 'リンク',
              creationTime: '2026-08-02T00:00:00Z',
              materials: [{ link: { url: 'https://example.test' } }],
            },
          ],
        })
      }
      if (requestUrl.pathname.endsWith('/announcements')) {
        return createJsonResponse({
          announcements: [
            {
              id: 'announcement-1',
              text: '連絡 https://forms.google.com/d/form-2/viewform',
              creationTime: '2026-08-03T00:00:00Z',
            },
          ],
        })
      }
      if (requestUrl.hostname === 'forms.gle') {
        return createRedirectResponse(
          'https://docs.google.com/forms/d/material-form/viewform?usp=sharing',
        )
      }
      throw new Error(`unexpected request: ${requestUrl}`)
    })
    const service = createGoogleClassroomService({ fetchImplementation })

    await expect(
      service.listActiveCoursesWithItems('access-token'),
    ).resolves.toEqual([
      {
        id: 'course-1',
        name: '数学',
        items: [
          {
            itemId: 'work-1',
            itemType: 'courseWork',
            title: '課題',
            description: 'https://docs.google.com/forms/d/form-1/viewform',
            creationTime: '2026-08-01T00:00:00Z',
            courseWorkType: 'ASSIGNMENT',
            forms: [
              {
                resolution: 'resolved',
                sourceUrl: 'https://docs.google.com/forms/d/form-1/viewform',
                formId: 'form-1',
                formUrl: 'https://docs.google.com/forms/d/form-1/viewform',
              },
            ],
          },
          {
            itemId: 'material-1',
            itemType: 'courseWorkMaterial',
            title: '資料',
            creationTime: '2026-08-02T00:00:00Z',
            forms: [
              {
                resolution: 'resolved',
                sourceUrl: 'https://forms.gle/material-short',
                formId: 'material-form',
                formUrl:
                  'https://docs.google.com/forms/d/material-form/viewform',
              },
            ],
          },
          {
            itemId: 'announcement-1',
            itemType: 'announcement',
            title: '連絡 https://forms.google.com/d/form-2/viewform',
            description: '連絡 https://forms.google.com/d/form-2/viewform',
            creationTime: '2026-08-03T00:00:00Z',
            forms: [
              {
                resolution: 'resolved',
                sourceUrl: 'https://forms.google.com/d/form-2/viewform',
                formId: 'form-2',
                formUrl: 'https://forms.google.com/d/form-2/viewform',
              },
            ],
          },
        ],
      },
    ])

    const formCalls = fetchImplementation.mock.calls.filter(
      ([requestUrl]) => requestUrl.hostname === 'forms.gle',
    )
    expect(formCalls).toHaveLength(1)
    expect(formCalls[0]?.[1]).toEqual(
      expect.objectContaining({ redirect: 'manual', referrer: '' }),
    )
    expect(formCalls[0]?.[1]).not.toHaveProperty('headers.Authorization')
  })

  it('keeps a short-link candidate unresolved after an unsafe redirect', async () => {
    const fetchImplementation = vi.fn(async (requestUrl) => {
      if (requestUrl.pathname === '/v1/courses') {
        return createJsonResponse({
          courses: [{ id: 'course-1', name: '数学' }],
        })
      }
      if (requestUrl.pathname.endsWith('/courseWork')) {
        return createJsonResponse({
          courseWork: [
            {
              id: 'work-1',
              title: '課題',
              workType: 'ASSIGNMENT',
              creationTime: '2026-08-01T00:00:00Z',
              materials: [{ form: { formUrl: 'https://forms.gle/unsafe' } }],
            },
          ],
        })
      }
      if (requestUrl.pathname.endsWith('/courseWorkMaterials')) {
        return createJsonResponse({ courseWorkMaterial: [] })
      }
      if (requestUrl.pathname.endsWith('/announcements')) {
        return createJsonResponse({ announcements: [] })
      }
      return createRedirectResponse('https://evil.example/forms/d/id/viewform')
    })

    await expect(
      createGoogleClassroomService({
        fetchImplementation,
      }).listActiveCoursesWithItems('access-token'),
    ).resolves.toMatchObject([
      {
        items: [
          {
            forms: [
              {
                resolution: 'unresolved',
                sourceUrl: 'https://forms.gle/unsafe',
              },
            ],
          },
        ],
      },
    ])
  })

  it('rejects malformed attached Form data while retaining network failures as unresolved', async () => {
    const fetchImplementation = vi.fn(async (requestUrl) => {
      if (requestUrl.pathname === '/v1/courses') {
        return createJsonResponse({
          courses: [{ id: 'course-1', name: '数学' }],
        })
      }
      if (requestUrl.pathname.endsWith('/courseWork')) {
        return createJsonResponse({
          courseWork: [
            {
              id: 'work-1',
              title: '課題',
              workType: 'ASSIGNMENT',
              creationTime: '2026-08-01T00:00:00Z',
              materials: [{ form: { formUrl: 'https://forms.example/id' } }],
            },
          ],
        })
      }
      return createJsonResponse({ courseWorkMaterial: [], announcements: [] })
    })
    await expect(
      createGoogleClassroomService({
        fetchImplementation,
      }).listActiveCoursesWithItems('access-token'),
    ).rejects.toMatchObject({ code: 'invalid_response' })
  })
})

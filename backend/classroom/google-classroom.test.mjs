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

function createRedirectResponse(location, status = 302) {
  return {
    ok: false,
    status,
    headers: new Headers({ location }),
    json: vi.fn(async () => ({})),
  }
}

function createItemsFetch({
  courseWork = [],
  courseWorkMaterial = [],
  announcements = [],
  studentSubmissions = [],
  onShortUrl,
} = {}) {
  return vi.fn(async (requestUrl, requestOptions) => {
    if (requestUrl.hostname === 'forms.gle') {
      if (onShortUrl === undefined) {
        throw new Error('short URL resolution failed')
      }
      return onShortUrl(requestUrl, requestOptions)
    }
    if (requestUrl.pathname === '/v1/courses') {
      return createJsonResponse({
        courses: [{ id: 'course-1', name: '数学' }],
      })
    }
    if (requestUrl.pathname.endsWith('/studentSubmissions')) {
      return createJsonResponse({ studentSubmissions })
    }
    if (requestUrl.pathname.endsWith('/courseWork')) {
      return createJsonResponse({ courseWork })
    }
    if (requestUrl.pathname.endsWith('/courseWorkMaterials')) {
      return createJsonResponse({ courseWorkMaterial })
    }
    if (requestUrl.pathname.endsWith('/announcements')) {
      return createJsonResponse({ announcements })
    }
    throw new Error(`unexpected request: ${requestUrl}`)
  })
}

describe('Google Classroom service', () => {
  it('counts ACTIVE courses across pages without exposing the token', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          courses: [{ id: 'course-1' }, { id: 'course-2' }],
          nextPageToken: 'next-page',
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({ courses: [{ id: 'course-3' }] }),
      )
    const service = createGoogleClassroomService({ fetchImplementation })

    await expect(service.countActiveCourses('secret-token')).resolves.toBe(3)
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
    expect(
      fetchImplementation.mock.calls[1][0].searchParams.get('pageToken'),
    ).toBe('next-page')
  })

  it('returns all distribution sources with course-work submission states', async () => {
    const fetchImplementation = createItemsFetch({
      courseWork: [
        {
          id: 'work-standard',
          title: '標準ID課題',
          description: 'https://docs.google.com/forms/d/standard-id/viewform',
          workType: 'ASSIGNMENT',
          dueDate: { year: 2026, month: 9, day: 6 },
          creationTime: '2026-09-01T00:00:00Z',
          state: 'PUBLISHED',
        },
        {
          id: 'work-published',
          title: '公開ID課題',
          workType: 'ASSIGNMENT',
          creationTime: '2026-09-02T00:00:00Z',
          materials: [
            {
              form: {
                formUrl:
                  'https://docs.google.com/forms/d/e/published-id/viewform',
                title: 'レスポンスに出してはいけないFormタイトル',
              },
            },
          ],
        },
        {
          id: 'draft',
          title: '下書き',
          workType: 'ASSIGNMENT',
          creationTime: '2026-09-03T00:00:00Z',
          state: 'DRAFT',
        },
      ],
      courseWorkMaterial: [
        {
          id: 'material-1',
          title: '資料',
          creationTime: '2026-09-03T00:00:00Z',
          materials: [{ link: { url: 'https://forms.gle/short' } }],
        },
        {
          id: 'material-without-form',
          title: '通常資料',
          creationTime: '2026-09-03T00:00:00Z',
          materials: [{ link: { url: 'https://example.com/' } }],
        },
      ],
      announcements: [
        {
          id: 'announcement-1',
          text: '連絡 https://forms.google.com/d/announcement-id/viewform',
          creationTime: '2026-09-04T00:00:00Z',
        },
      ],
      studentSubmissions: [
        { courseWorkId: 'work-standard', state: 'NEW' },
        { courseWorkId: 'work-published', state: 'TURNED_IN' },
        { courseWorkId: 'draft', state: 'NEW' },
      ],
      onShortUrl: () =>
        createRedirectResponse(
          'https://docs.google.com/forms/d/e/material-id/viewform?usp=sharing',
        ),
    })
    const service = createGoogleClassroomService({ fetchImplementation })

    const result = await service.listActiveCoursesWithItems('access-token')

    expect(result).toEqual([
      {
        id: 'course-1',
        name: '数学',
        items: [
          {
            itemId: 'work-standard',
            itemType: 'courseWork',
            title: '標準ID課題',
            description: 'https://docs.google.com/forms/d/standard-id/viewform',
            dueDate: '2026-09-06',
            courseWorkType: 'ASSIGNMENT',
            creationTime: '2026-09-01T00:00:00Z',
            submissionStatus: 'unsubmitted',
            forms: [
              {
                resolution: 'resolved',
                sourceUrl:
                  'https://docs.google.com/forms/d/standard-id/viewform',
                formId: 'standard-id',
                formIdType: 'standard',
                formUrl: 'https://docs.google.com/forms/d/standard-id/viewform',
              },
            ],
          },
          {
            itemId: 'work-published',
            itemType: 'courseWork',
            title: '公開ID課題',
            courseWorkType: 'ASSIGNMENT',
            creationTime: '2026-09-02T00:00:00Z',
            submissionStatus: 'submitted',
            forms: [
              {
                resolution: 'resolved',
                sourceUrl:
                  'https://docs.google.com/forms/d/e/published-id/viewform',
                formId: 'published-id',
                formIdType: 'published',
                formUrl:
                  'https://docs.google.com/forms/d/e/published-id/viewform',
              },
            ],
          },
          {
            itemId: 'material-1',
            itemType: 'courseWorkMaterial',
            title: '資料',
            creationTime: '2026-09-03T00:00:00Z',
            submissionStatus: 'untracked',
            forms: [
              {
                resolution: 'resolved',
                sourceUrl: 'https://forms.gle/short',
                formId: 'material-id',
                formIdType: 'published',
                formUrl:
                  'https://docs.google.com/forms/d/e/material-id/viewform',
              },
            ],
          },
          {
            itemId: 'announcement-1',
            itemType: 'announcement',
            title: '連絡 https://forms.google.com/d/announcement-id/viewform',
            description:
              '連絡 https://forms.google.com/d/announcement-id/viewform',
            creationTime: '2026-09-04T00:00:00Z',
            submissionStatus: 'untracked',
            forms: [
              {
                resolution: 'resolved',
                sourceUrl:
                  'https://forms.google.com/d/announcement-id/viewform',
                formId: 'announcement-id',
                formIdType: 'standard',
                formUrl: 'https://forms.google.com/d/announcement-id/viewform',
              },
            ],
          },
        ],
      },
    ])
    expect(JSON.stringify(result)).not.toContain('Formタイトル')

    const shortCall = fetchImplementation.mock.calls.find(
      ([requestUrl]) => requestUrl.hostname === 'forms.gle',
    )
    expect(shortCall?.[1]).toEqual(
      expect.objectContaining({
        credentials: 'omit',
        redirect: 'manual',
        referrerPolicy: 'no-referrer',
        signal: expect.any(AbortSignal),
      }),
    )
    expect(shortCall?.[1]).not.toHaveProperty('headers')
  })

  it.each([
    ['network failure', () => Promise.reject(new Error('network'))],
    [
      'redirect to a non-allowlisted host',
      () => createRedirectResponse('https://evil.example/forms/d/id/viewform'),
    ],
    [
      'redirect containing URL credentials',
      () =>
        createRedirectResponse(
          'https://user:password@forms.gle/another-short-link',
        ),
    ],
  ])(
    'returns unresolved for a short URL %s',
    async (_description, onShortUrl) => {
      const fetchImplementation = createItemsFetch({
        courseWork: [
          {
            id: 'work-1',
            title: '課題',
            workType: 'ASSIGNMENT',
            creationTime: '2026-09-01T00:00:00Z',
            materials: [{ form: { formUrl: 'https://forms.gle/unsafe' } }],
          },
        ],
        studentSubmissions: [{ courseWorkId: 'work-1', state: 'NEW' }],
        onShortUrl,
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
                  reason: 'short_url_resolution_failed',
                },
              ],
            },
          ],
        },
      ])
    },
  )

  it('returns unresolved when a short URL exceeds the redirect hop limit', async () => {
    const onShortUrl = vi.fn((requestUrl) =>
      createRedirectResponse(
        `https://forms.gle/hop-${new URL(requestUrl).pathname.length}`,
      ),
    )
    const fetchImplementation = createItemsFetch({
      courseWork: [
        {
          id: 'work-1',
          title: '課題',
          workType: 'ASSIGNMENT',
          creationTime: '2026-09-01T00:00:00Z',
          materials: [{ form: { formUrl: 'https://forms.gle/a' } }],
        },
      ],
      studentSubmissions: [{ courseWorkId: 'work-1', state: 'NEW' }],
      onShortUrl,
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
                sourceUrl: 'https://forms.gle/a',
                reason: 'short_url_resolution_failed',
              },
            ],
          },
        ],
      },
    ])
    // The initial request plus FORM_REDIRECT_MAX_HOPS follow-ups, and then it
    // gives up instead of following redirects forever.
    expect(onShortUrl).toHaveBeenCalledTimes(4)
  })

  it('caches one short URL only for the current items request', async () => {
    const onShortUrl = vi.fn(() =>
      createRedirectResponse(
        'https://docs.google.com/forms/d/e/published-id/viewform',
      ),
    )
    const repeatedForm = { form: { formUrl: 'https://forms.gle/repeated' } }
    const fetchImplementation = createItemsFetch({
      courseWork: [
        {
          id: 'work-1',
          title: '課題',
          workType: 'ASSIGNMENT',
          creationTime: '2026-09-01T00:00:00Z',
          materials: [repeatedForm, repeatedForm],
        },
      ],
      studentSubmissions: [{ courseWorkId: 'work-1', state: 'NEW' }],
      onShortUrl,
    })
    const service = createGoogleClassroomService({ fetchImplementation })

    await service.listActiveCoursesWithItems('access-token')
    expect(onShortUrl).toHaveBeenCalledTimes(1)
    await service.listActiveCoursesWithItems('access-token')
    expect(onShortUrl).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['TURNED_IN', 'submitted'],
    ['RETURNED', 'submitted'],
    ['NEW', 'unsubmitted'],
    ['CREATED', 'unsubmitted'],
    ['RECLAIMED_BY_STUDENT', 'unsubmitted'],
  ])('maps submission state %s to %s', async (state, submissionStatus) => {
    const service = createGoogleClassroomService({
      fetchImplementation: createItemsFetch({
        courseWork: [
          {
            id: 'work-1',
            title: '課題',
            workType: 'ASSIGNMENT',
            creationTime: '2026-09-01T00:00:00Z',
          },
        ],
        studentSubmissions: [{ courseWorkId: 'work-1', state }],
      }),
    })

    await expect(
      service.listActiveCoursesWithItems('access-token'),
    ).resolves.toMatchObject([
      { items: [{ itemId: 'work-1', submissionStatus }] },
    ])
  })

  it('treats a zero grade as submitted', async () => {
    // `if (assignedGrade)` would drop a 0 point grade back to unsubmitted.
    const service = createGoogleClassroomService({
      fetchImplementation: createItemsFetch({
        courseWork: [
          {
            id: 'work-1',
            title: '課題',
            workType: 'ASSIGNMENT',
            creationTime: '2026-09-01T00:00:00Z',
          },
        ],
        studentSubmissions: [
          { courseWorkId: 'work-1', state: 'NEW', assignedGrade: 0 },
        ],
      }),
    })

    await expect(
      service.listActiveCoursesWithItems('access-token'),
    ).resolves.toMatchObject([
      { items: [{ itemId: 'work-1', submissionStatus: 'submitted' }] },
    ])
  })

  it('pages student submissions and ignores records for removed course work', async () => {
    const courseWork = [
      {
        id: 'work-1',
        title: '課題1',
        workType: 'ASSIGNMENT',
        creationTime: '2026-09-01T00:00:00Z',
      },
      {
        id: 'work-2',
        title: '課題2',
        workType: 'ASSIGNMENT',
        creationTime: '2026-09-02T00:00:00Z',
      },
    ]
    const submissionPages = [
      {
        studentSubmissions: [{ courseWorkId: 'work-1', state: 'TURNED_IN' }],
        nextPageToken: 'submission-page-2',
      },
      {
        studentSubmissions: [
          { courseWorkId: 'work-2', state: 'NEW' },
          // Course work deleted from Classroom keeps its submission history.
          { courseWorkId: 'work-deleted', state: 'TURNED_IN' },
        ],
      },
    ]
    const submissionRequestUrls = []
    const fetchImplementation = vi.fn(async (requestUrl) => {
      if (requestUrl.pathname === '/v1/courses') {
        return createJsonResponse({
          courses: [{ id: 'course-1', name: '数学' }],
        })
      }
      if (requestUrl.pathname.endsWith('/studentSubmissions')) {
        submissionRequestUrls.push(requestUrl)
        return createJsonResponse(
          submissionPages[submissionRequestUrls.length - 1],
        )
      }
      if (requestUrl.pathname.endsWith('/courseWork')) {
        return createJsonResponse({ courseWork })
      }
      return createJsonResponse({})
    })

    await expect(
      createGoogleClassroomService({
        fetchImplementation,
      }).listActiveCoursesWithItems('access-token'),
    ).resolves.toMatchObject([
      {
        items: [
          { itemId: 'work-1', submissionStatus: 'submitted' },
          { itemId: 'work-2', submissionStatus: 'unsubmitted' },
        ],
      },
    ])

    expect(submissionRequestUrls).toHaveLength(2)
    const [firstRequestUrl, secondRequestUrl] = submissionRequestUrls
    expect(firstRequestUrl.pathname).toBe(
      '/v1/courses/course-1/courseWork/-/studentSubmissions',
    )
    expect(firstRequestUrl.searchParams.get('userId')).toBe('me')
    expect(firstRequestUrl.searchParams.get('pageSize')).toBe('100')
    // Omitting nextPageToken from `fields` silently truncates page 2.
    expect(firstRequestUrl.searchParams.get('fields')).toBe(
      'nextPageToken,studentSubmissions(courseWorkId,state,assignedGrade)',
    )
    expect(firstRequestUrl.searchParams.get('pageToken')).toBeNull()
    expect(secondRequestUrl.searchParams.get('pageToken')).toBe(
      'submission-page-2',
    )
  })

  it('marks course work without a submission record as untracked', async () => {
    // Course work assigned to selected students only has no submission record
    // for this user, so the course must still synchronize.
    const service = createGoogleClassroomService({
      fetchImplementation: createItemsFetch({
        courseWork: [
          {
            id: 'work-1',
            title: '他の生徒に割り当てられた課題',
            workType: 'ASSIGNMENT',
            creationTime: '2026-09-01T00:00:00Z',
          },
        ],
        studentSubmissions: [],
      }),
    })

    await expect(
      service.listActiveCoursesWithItems('access-token'),
    ).resolves.toMatchObject([
      { items: [{ itemId: 'work-1', submissionStatus: 'untracked' }] },
    ])
  })

  it('rejects duplicate and invalid student submissions', async () => {
    const courseWork = [
      {
        id: 'work-1',
        title: '課題',
        workType: 'ASSIGNMENT',
        creationTime: '2026-09-01T00:00:00Z',
      },
    ]

    for (const studentSubmissions of [
      [
        { courseWorkId: 'work-1', state: 'NEW' },
        { courseWorkId: 'work-1', state: 'TURNED_IN' },
      ],
      [{ courseWorkId: 'work-1', state: 'UNKNOWN' }],
      [{ courseWorkId: 'work-1', state: 'NEW', assignedGrade: -1 }],
      [{ courseWorkId: '', state: 'NEW' }],
      [null],
    ]) {
      await expect(
        createGoogleClassroomService({
          fetchImplementation: createItemsFetch({
            courseWork,
            studentSubmissions,
          }),
        }).listActiveCoursesWithItems('access-token'),
      ).rejects.toMatchObject({ code: 'invalid_response' })
    }
  })

  it.each([401, 403, 429])(
    'preserves upstream status %s without reading its body',
    async (status) => {
      const response = createJsonResponse(
        { sensitiveDetails: 'not-read' },
        status,
      )
      const service = createGoogleClassroomService({
        fetchImplementation: vi.fn(async () => response),
      })

      await expect(
        service.listActiveCoursesWithItems('access-token'),
      ).rejects.toEqual(
        expect.objectContaining({
          name: 'ClassroomRequestError',
          code: 'upstream_error',
          status,
        }),
      )
      expect(response.json).not.toHaveBeenCalled()
    },
  )

  it('rejects a repeated page token instead of looping forever', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({ nextPageToken: 'repeated-page' }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({ nextPageToken: 'repeated-page' }),
      )
    const service = createGoogleClassroomService({ fetchImplementation })

    await expect(
      service.countActiveCourses('access-token'),
    ).rejects.toBeInstanceOf(ClassroomRequestError)
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
  })
})

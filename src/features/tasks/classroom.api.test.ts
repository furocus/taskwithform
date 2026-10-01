import { describe, expect, it, vi } from 'vitest'

import { BackendApiError } from '../../shared/api/backendApi'
import { getClassroomItems, parseClassroomItemsResponse } from './classroom.api'
import { activeCourseListFixture } from './classroom.fixtures'

function createJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
  } as unknown as Response
}

describe('parseClassroomItemsResponse', () => {
  it('keeps the agreed items contract, including submission and ID types', () => {
    expect(parseClassroomItemsResponse(activeCourseListFixture)).toEqual(
      activeCourseListFixture.courses,
    )
  })

  it('accepts mixed distribution types and explicit unresolved reasons', () => {
    const parsed = parseClassroomItemsResponse({
      courses: [
        {
          id: 'course-1',
          name: '数学',
          items: [
            {
              itemId: 'work-1',
              itemType: 'courseWork',
              title: '課題',
              courseWorkType: 'ASSIGNMENT',
              submissionStatus: 'unsubmitted',
              creationTime: '2026-08-01T00:00:00Z',
              forms: [
                {
                  resolution: 'resolved',
                  sourceUrl: 'https://forms.gle/source',
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
              submissionStatus: 'untracked',
              title: '資料',
              creationTime: '2026-08-02T00:00:00+09:00',
              forms: [
                {
                  resolution: 'unresolved',
                  sourceUrl: 'https://forms.gle/unresolved',
                  reason: 'short_url_resolution_failed',
                },
              ],
            },
          ],
        },
      ],
    })

    expect(parsed[0]?.items).toHaveLength(2)
    expect(parsed[0]?.items[0]?.forms[0]).toMatchObject({
      formIdType: 'published',
    })
    expect(parsed[0]?.items[1]?.forms[0]).toEqual({
      resolution: 'unresolved',
      sourceUrl: 'https://forms.gle/unresolved',
      reason: 'short_url_resolution_failed',
    })
  })

  it('accepts empty optional text without dropping it', () => {
    const item = activeCourseListFixture.courses[0]!.items[0]!
    const parsed = parseClassroomItemsResponse({
      courses: [
        {
          id: 'course-1',
          name: '数学',
          items: [{ ...item, description: '', alternateLink: '' }],
        },
      ],
    })

    expect(parsed[0]?.items[0]).toMatchObject({
      description: '',
      alternateLink: '',
    })
  })

  it.each([undefined, null, '', 'TURNED_IN', 1])(
    'rejects course work submissionStatus %s',
    (submissionStatus) => {
      expect(() =>
        parseClassroomItemsResponse({
          courses: [
            {
              id: 'course-1',
              name: '数学',
              items: [
                {
                  itemId: 'work-1',
                  itemType: 'courseWork',
                  title: '課題',
                  courseWorkType: 'ASSIGNMENT',
                  submissionStatus,
                  creationTime: '2026-08-01T00:00:00Z',
                  forms: [],
                },
              ],
            },
          ],
        }),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid_backend_response',
          reason: 'invalid_submission_status',
        }),
      )
    },
  )

  it('rejects an ID type that disagrees with the canonical Form path', () => {
    expect(() =>
      parseClassroomItemsResponse({
        courses: [
          {
            id: 'course-1',
            name: '数学',
            items: [
              {
                itemId: 'work-1',
                itemType: 'courseWork',
                title: '課題',
                courseWorkType: 'ASSIGNMENT',
                submissionStatus: 'unsubmitted',
                creationTime: '2026-08-01T00:00:00Z',
                forms: [
                  {
                    resolution: 'resolved',
                    sourceUrl:
                      'https://docs.google.com/forms/d/standard-id/viewform',
                    formId: 'standard-id',
                    formIdType: 'published',
                    formUrl:
                      'https://docs.google.com/forms/d/standard-id/viewform',
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({ reason: 'invalid_form_reference' }),
    )
  })

  it.each([
    [
      'invalid creation time',
      {
        itemId: 'work-1',
        itemType: 'courseWork',
        title: '課題',
        courseWorkType: 'ASSIGNMENT',
        submissionStatus: 'unsubmitted',
        creationTime: 'not-a-time',
        forms: [],
      },
    ],
    [
      'unresolved canonical URL',
      {
        itemId: 'material-1',
        itemType: 'courseWorkMaterial',
        submissionStatus: 'untracked',
        title: '資料',
        creationTime: '2026-08-01T00:00:00Z',
        forms: [
          {
            resolution: 'unresolved',
            sourceUrl: 'https://docs.google.com/forms/d/standard-id/viewform',
            reason: 'short_url_resolution_failed',
          },
        ],
      },
    ],
    [
      'submission state on material',
      {
        itemId: 'material-1',
        itemType: 'courseWorkMaterial',
        title: '資料',
        submissionStatus: 'unsubmitted',
        creationTime: '2026-08-01T00:00:00Z',
        forms: [],
      },
    ],
  ])('rejects %s', (_description, item) => {
    expect(() =>
      parseClassroomItemsResponse({
        courses: [{ id: 'course-1', name: '数学', items: [item] }],
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'invalid_backend_response' }),
    )
  })

  it.each([
    ['a missing courses field', {}],
    ['a non-array courses field', { courses: { id: 'course-1' } }],
    ['a course without an id', { courses: [{ name: '数学', items: [] }] }],
    ['an empty course id', { courses: [{ id: '', name: '数学', items: [] }] }],
    ['a course without a name', { courses: [{ id: 'course-1', items: [] }] }],
    [
      'a course without an items field',
      { courses: [{ id: 'course-1', name: '数学' }] },
    ],
  ])('rejects %s', (_description, responseBody) => {
    expect(() => parseClassroomItemsResponse(responseBody)).toThrowError(
      expect.objectContaining({
        name: 'BackendApiError',
        code: 'invalid_backend_response',
      }),
    )
  })

  it.each([
    [
      'a missing itemId',
      {
        itemType: 'courseWork',
        title: '課題',
        courseWorkType: 'ASSIGNMENT',
        submissionStatus: 'unsubmitted',
        creationTime: '2026-08-01T00:00:00Z',
        forms: [],
      },
    ],
    [
      'a missing title',
      {
        itemId: 'work-1',
        itemType: 'courseWork',
        courseWorkType: 'ASSIGNMENT',
        submissionStatus: 'unsubmitted',
        creationTime: '2026-08-01T00:00:00Z',
        forms: [],
      },
    ],
    [
      'an unknown courseWorkType',
      {
        itemId: 'work-1',
        itemType: 'courseWork',
        title: '課題',
        courseWorkType: 'ANNOUNCEMENT',
        submissionStatus: 'unsubmitted',
        creationTime: '2026-08-01T00:00:00Z',
        forms: [],
      },
    ],
    [
      'a missing forms field',
      {
        itemId: 'work-1',
        itemType: 'courseWork',
        title: '課題',
        courseWorkType: 'ASSIGNMENT',
        submissionStatus: 'unsubmitted',
        creationTime: '2026-08-01T00:00:00Z',
      },
    ],
    [
      'a malformed Form reference',
      {
        itemId: 'work-1',
        itemType: 'courseWork',
        title: '課題',
        courseWorkType: 'ASSIGNMENT',
        submissionStatus: 'unsubmitted',
        creationTime: '2026-08-01T00:00:00Z',
        forms: [{ resolution: 'resolved', formId: 'form-id' }],
      },
    ],
    [
      'a non-existent due date',
      {
        itemId: 'work-1',
        itemType: 'courseWork',
        title: '課題',
        courseWorkType: 'ASSIGNMENT',
        submissionStatus: 'unsubmitted',
        creationTime: '2026-08-01T00:00:00Z',
        dueDate: '2026-02-30',
        forms: [],
      },
    ],
    [
      'a non-string description',
      {
        itemId: 'work-1',
        itemType: 'courseWork',
        title: '課題',
        description: 12,
        courseWorkType: 'ASSIGNMENT',
        submissionStatus: 'unsubmitted',
        creationTime: '2026-08-01T00:00:00Z',
        forms: [],
      },
    ],
  ])('rejects an item with %s', (_description, item) => {
    expect(() =>
      parseClassroomItemsResponse({
        courses: [{ id: 'course-1', name: '数学', items: [item] }],
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'invalid_backend_response' }),
    )
  })

  it('accepts untracked course work assigned to other students only', () => {
    const parsed = parseClassroomItemsResponse({
      courses: [
        {
          id: 'course-1',
          name: '数学',
          items: [
            {
              itemId: 'work-1',
              itemType: 'courseWork',
              title: '個別割り当ての課題',
              courseWorkType: 'ASSIGNMENT',
              submissionStatus: 'untracked',
              creationTime: '2026-08-01T00:00:00Z',
              forms: [],
            },
          ],
        },
      ],
    })

    expect(parsed[0]?.items[0]?.submissionStatus).toBe('untracked')
  })

  it('rejects duplicate item keys and duplicate courses', () => {
    const item = activeCourseListFixture.courses[0]!.items[0]!
    expect(() =>
      parseClassroomItemsResponse({
        courses: [{ id: 'course-1', name: '数学', items: [item, item] }],
      }),
    ).toThrowError(expect.objectContaining({ reason: 'duplicate_item' }))

    expect(() =>
      parseClassroomItemsResponse({
        courses: [
          { id: 'course-1', name: '数学', items: [] },
          { id: 'course-1', name: '数学', items: [] },
        ],
      }),
    ).toThrowError(expect.objectContaining({ reason: 'duplicate_course' }))
  })

  it('scopes duplicate item IDs by both type and course', () => {
    const item = activeCourseListFixture.courses[0]!.items[0]!
    expect(
      parseClassroomItemsResponse({
        courses: [
          { id: 'course-1', name: '数学', items: [item] },
          { id: 'course-2', name: '英語', items: [item] },
        ],
      }),
    ).toHaveLength(2)

    const announcement = {
      ...item,
      itemType: 'announcement',
      submissionStatus: 'untracked',
      courseWorkType: undefined,
      dueDate: undefined,
    }
    expect(
      parseClassroomItemsResponse({
        courses: [
          { id: 'course-1', name: '数学', items: [item, announcement] },
        ],
      })[0]?.items,
    ).toHaveLength(2)
  })

  it('keeps the diagnostic reason separate from the caller-facing error code', () => {
    expect(() => parseClassroomItemsResponse({})).toThrowError(
      expect.objectContaining({
        code: 'invalid_backend_response',
        reason: 'missing_courses',
        message: 'invalid_backend_response (missing_courses)',
      }),
    )
  })
})

describe('getClassroomItems', () => {
  it('requests only GET /api/classroom/courses/items', async () => {
    const fetchImplementation = vi.fn(async () =>
      createJsonResponse(activeCourseListFixture),
    )

    await expect(
      getClassroomItems(fetchImplementation as unknown as typeof fetch),
    ).resolves.toEqual(activeCourseListFixture.courses)
    expect(fetchImplementation).toHaveBeenCalledWith(
      '/api/classroom/courses/items',
      { credentials: 'same-origin' },
    )
  })

  it.each([
    ['session_expired', 401],
    ['classroom_scope_missing', 403],
    ['classroom_rate_limited', 503],
    ['classroom_unavailable', 502],
  ])('surfaces backend error %s', async (code, status) => {
    const fetchImplementation = vi.fn(async () =>
      createJsonResponse({ error: { code } }, status),
    )

    await expect(
      getClassroomItems(fetchImplementation as unknown as typeof fetch),
    ).rejects.toEqual(new BackendApiError(code, status))
  })

  it('falls back to a stable error when an error body is unreadable', async () => {
    const fetchImplementation = vi.fn(
      async () =>
        ({
          ok: false,
          status: 500,
          json: vi.fn(async () => {
            throw new Error('not json')
          }),
        }) as unknown as Response,
    )

    await expect(
      getClassroomItems(fetchImplementation as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: 'backend_error', status: 500 })
  })

  it('rejects a successful response that is not JSON', async () => {
    const fetchImplementation = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: vi.fn(async () => {
            throw new Error('not json')
          }),
        }) as unknown as Response,
    )

    await expect(
      getClassroomItems(fetchImplementation as unknown as typeof fetch),
    ).rejects.toMatchObject({
      code: 'invalid_backend_response',
      reason: 'unreadable_body',
    })
  })

  it('rejects a legacy coursework response instead of adapting it', async () => {
    const fetchImplementation = vi.fn(async () =>
      createJsonResponse({
        courses: [{ id: 'course-1', name: '数学', courseWork: [] }],
      }),
    )

    await expect(
      getClassroomItems(fetchImplementation as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: 'invalid_backend_response' })
  })
})

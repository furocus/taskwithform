import { describe, expect, it, vi } from 'vitest'

import { BackendApiError } from '../../shared/api/backendApi'
import {
  getClassroomCourses,
  getClassroomItems,
  parseClassroomCourseList,
  parseClassroomItemsResponse,
} from './classroom.api'
import { activeCourseListFixture } from './classroom.fixtures'

function createJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
  } as unknown as Response
}

describe('parseClassroomCourseList', () => {
  it('keeps every agreed field of the ACTIVE course list, including an empty course', () => {
    expect(parseClassroomCourseList(activeCourseListFixture)).toEqual(
      activeCourseListFixture.courses,
    )
  })

  it('drops fields the database does not store', () => {
    const courses = parseClassroomCourseList({
      courses: [
        {
          id: 'course-1',
          name: '数学',
          creatorUserId: 'user-1',
          courseWork: [
            {
              courseWorkId: 'work-1',
              courseWorkType: 'ASSIGNMENT',
              title: '確認テスト',
              maxPoints: 100,
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
      ],
    })

    expect(courses).toEqual([
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
                formUrl: 'https://docs.google.com/forms/d/form-id/viewform',
              },
            ],
          },
        ],
      },
    ])
  })

  it('accepts an empty description and an empty alternate link', () => {
    expect(
      parseClassroomCourseList({
        courses: [
          {
            id: 'course-1',
            name: '数学',
            courseWork: [
              {
                courseWorkId: 'work-1',
                courseWorkType: 'ASSIGNMENT',
                title: '確認テスト',
                description: '',
                alternateLink: '',
                forms: [],
              },
            ],
          },
        ],
      })[0]?.courseWork[0],
    ).toMatchObject({ description: '', alternateLink: '' })
  })

  it.each([
    ['a missing courses field', {}],
    ['a non-array courses field', { courses: { id: 'course-1' } }],
    ['a course without an id', { courses: [{ name: '数学', courseWork: [] }] }],
    [
      'an empty course id',
      { courses: [{ id: '', name: '数学', courseWork: [] }] },
    ],
    [
      'a course without a name',
      { courses: [{ id: 'course-1', courseWork: [] }] },
    ],
    [
      'a course without a courseWork field',
      { courses: [{ id: 'course-1', name: '数学' }] },
    ],
    [
      'a duplicated course',
      {
        courses: [
          { id: 'course-1', name: '数学', courseWork: [] },
          { id: 'course-1', name: '数学', courseWork: [] },
        ],
      },
    ],
  ])('rejects %s', (_description, responseBody) => {
    expect(() => parseClassroomCourseList(responseBody)).toThrowError(
      expect.objectContaining({
        name: 'BackendApiError',
        code: 'invalid_backend_response',
      }),
    )
  })

  it.each([
    [
      'a missing courseWorkId',
      { courseWorkType: 'ASSIGNMENT', title: 'a', forms: [] },
    ],
    [
      'a missing title',
      { courseWorkId: 'work-1', courseWorkType: 'ASSIGNMENT', forms: [] },
    ],
    [
      'an unknown course work type',
      {
        courseWorkId: 'work-1',
        courseWorkType: 'ANNOUNCEMENT',
        title: 'a',
        forms: [],
      },
    ],
    [
      'a missing forms field',
      { courseWorkId: 'work-1', courseWorkType: 'ASSIGNMENT', title: 'a' },
    ],
    [
      'a form without a URL',
      {
        courseWorkId: 'work-1',
        courseWorkType: 'ASSIGNMENT',
        title: 'a',
        forms: [{ formId: 'form-id' }],
      },
    ],
    [
      'a non-existent due date',
      {
        courseWorkId: 'work-1',
        courseWorkType: 'ASSIGNMENT',
        title: 'a',
        dueDate: '2026-02-30',
        forms: [],
      },
    ],
    [
      'a due date that is not YYYY-MM-DD',
      {
        courseWorkId: 'work-1',
        courseWorkType: 'ASSIGNMENT',
        title: 'a',
        dueDate: '2026-9-4',
        forms: [],
      },
    ],
    [
      'a non-string description',
      {
        courseWorkId: 'work-1',
        courseWorkType: 'ASSIGNMENT',
        title: 'a',
        description: 12,
        forms: [],
      },
    ],
  ])('rejects course work with %s', (_description, courseWork) => {
    expect(() =>
      parseClassroomCourseList({
        courses: [{ id: 'course-1', name: '数学', courseWork: [courseWork] }],
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'invalid_backend_response' }),
    )
  })

  it('rejects the same courseWorkId twice inside one course', () => {
    const courseWork = {
      courseWorkId: 'work-1',
      courseWorkType: 'ASSIGNMENT',
      title: '確認テスト',
      forms: [],
    }

    expect(() =>
      parseClassroomCourseList({
        courses: [
          {
            id: 'course-1',
            name: '数学',
            courseWork: [courseWork, courseWork],
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'invalid_backend_response' }),
    )
  })

  it('accepts the same courseWorkId in different courses', () => {
    const courseWork = {
      courseWorkId: 'work-1',
      courseWorkType: 'ASSIGNMENT',
      title: '確認テスト',
      forms: [],
    }

    expect(
      parseClassroomCourseList({
        courses: [
          { id: 'course-1', name: '数学', courseWork: [courseWork] },
          { id: 'course-2', name: '英語', courseWork: [courseWork] },
        ],
      }),
    ).toHaveLength(2)
  })

  it.each([
    [
      'unknown_course_work_type',
      {
        courses: [
          {
            id: 'course-1',
            name: '数学',
            courseWork: [
              {
                courseWorkId: 'work-1',
                courseWorkType: 'ANNOUNCEMENT',
                title: 'a',
                forms: [],
              },
            ],
          },
        ],
      },
    ],
    [
      'invalid_due_date',
      {
        courses: [
          {
            id: 'course-1',
            name: '数学',
            courseWork: [
              {
                courseWorkId: 'work-1',
                courseWorkType: 'ASSIGNMENT',
                title: 'a',
                dueDate: '2026-02-30',
                forms: [],
              },
            ],
          },
        ],
      },
    ],
    [
      'duplicate_course',
      {
        courses: [
          { id: 'course-1', name: '数学', courseWork: [] },
          { id: 'course-1', name: '数学', courseWork: [] },
        ],
      },
    ],
    ['missing_courses', {}],
  ])(
    'reports %s as the rejection reason without changing the error code',
    (reason, responseBody) => {
      expect(() => parseClassroomCourseList(responseBody, 200)).toThrowError(
        expect.objectContaining({
          code: 'invalid_backend_response',
          reason,
        }),
      )
    },
  )

  it('keeps the diagnostic reason out of the caller-facing code', () => {
    let thrown: unknown
    try {
      parseClassroomCourseList({})
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(BackendApiError)
    expect((thrown as BackendApiError).code).toBe('invalid_backend_response')
    expect((thrown as BackendApiError).message).toBe(
      'invalid_backend_response (missing_courses)',
    )
  })
})

describe('getClassroomCourses', () => {
  it('requests the course work endpoint with the session cookie', async () => {
    const fetchImplementation = vi.fn(async () =>
      createJsonResponse(activeCourseListFixture),
    )

    await expect(
      getClassroomCourses(fetchImplementation as unknown as typeof fetch),
    ).resolves.toEqual(activeCourseListFixture.courses)
    expect(fetchImplementation).toHaveBeenCalledWith(
      '/api/classroom/courses/coursework',
      { credentials: 'same-origin' },
    )
  })

  it.each([
    ['session_expired', 401],
    ['classroom_scope_missing', 403],
    ['classroom_unavailable', 502],
  ])('surfaces the backend error code %s', async (code, status) => {
    const fetchImplementation = vi.fn(async () =>
      createJsonResponse({ error: { code, message: 'ignored' } }, status),
    )

    await expect(
      getClassroomCourses(fetchImplementation as unknown as typeof fetch),
    ).rejects.toEqual(new BackendApiError(code, status))
  })

  it('falls back to a stable error when the failure body is unreadable', async () => {
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
      getClassroomCourses(fetchImplementation as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: 'backend_error', status: 500 })
  })

  it('rejects a success response that is not JSON', async () => {
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
      getClassroomCourses(fetchImplementation as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: 'invalid_backend_response' })
  })
})

describe('Classroom distribution items', () => {
  const item = {
    itemId: 'work-1',
    itemType: 'courseWork',
    title: '確認テスト',
    courseWorkType: 'ASSIGNMENT',
    creationTime: '2026-08-01T00:00:00Z',
    forms: [
      {
        resolution: 'resolved',
        sourceUrl: 'https://forms.gle/abc',
        formId: 'form-1',
        formUrl: 'https://docs.google.com/forms/d/form-1/viewform',
        title: '回答フォーム',
      },
      {
        resolution: 'unresolved',
        sourceUrl: 'https://forms.gle/broken',
      },
    ],
  }

  it('parses structured Forms and keeps mixed distribution item types', () => {
    const parsed = parseClassroomItemsResponse({
      courses: [
        {
          id: 'course-1',
          name: '数学',
          items: [
            item,
            {
              itemId: 'material-1',
              itemType: 'courseWorkMaterial',
              title: '資料',
              creationTime: '2026-08-02T00:00:00+09:00',
              forms: [item.forms[0]],
            },
            {
              itemId: 'announcement-1',
              itemType: 'announcement',
              title: '連絡',
              creationTime: '2026-08-03T00:00:00Z',
              forms: [],
            },
          ],
        },
      ],
    })
    expect(parsed[0]?.items[0]?.forms[0]).toEqual(item.forms[0])
  })

  it.each([
    {
      itemId: 'work-1',
      itemType: 'courseWork',
      title: '課題',
      courseWorkType: 'ASSIGNMENT',
      forms: [],
    },
    {
      itemId: 'work-1',
      itemType: 'courseWork',
      title: '課題',
      courseWorkType: 'ASSIGNMENT',
      creationTime: 'not-a-time',
      forms: [],
    },
  ])('rejects an item without a valid creationTime', (invalidItem) => {
    expect(() =>
      parseClassroomItemsResponse({
        courses: [{ id: 'course-1', name: '数学', items: [invalidItem] }],
      }),
    ).toThrowError(expect.objectContaining({ reason: expect.any(String) }))
  })

  it('requests GET /api/classroom/courses/items', async () => {
    const fetchImplementation = vi.fn(async () =>
      createJsonResponse({
        courses: [{ id: 'course-1', name: '数学', items: [item] }],
      }),
    )
    await expect(
      getClassroomItems(fetchImplementation as unknown as typeof fetch),
    ).resolves.toHaveLength(1)
    expect(fetchImplementation).toHaveBeenCalledWith(
      '/api/classroom/courses/items',
      { credentials: 'same-origin' },
    )
  })
})

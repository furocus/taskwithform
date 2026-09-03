import { describe, expect, it, vi } from 'vitest'

import { BackendApiError } from '../../shared/api/backendApi'
import { getClassroomCourses, parseClassroomCourseList } from './classroom.api'
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
              submissionStatus: 'unsubmitted',
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
            submissionStatus: 'unsubmitted',
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
                submissionStatus: 'unsubmitted',
                forms: [],
              },
            ],
          },
        ],
      })[0]?.courseWork[0],
    ).toMatchObject({ description: '', alternateLink: '' })
  })

  it.each(['unsubmitted', 'submitted'])(
    'accepts normalized submission status %s',
    (submissionStatus) => {
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
                  submissionStatus,
                  forms: [],
                },
              ],
            },
          ],
        })[0]?.courseWork[0]?.submissionStatus,
      ).toBe(submissionStatus)
    },
  )

  it.each([undefined, null, '', 'TURNED_IN', 1])(
    'rejects an invalid submission status %s with a diagnostic reason',
    (submissionStatus) => {
      expect(() =>
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
                  submissionStatus,
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
      submissionStatus: 'unsubmitted',
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
      submissionStatus: 'unsubmitted',
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
                submissionStatus: 'unsubmitted',
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

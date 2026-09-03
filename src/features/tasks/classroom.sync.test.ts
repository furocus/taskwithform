import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TaskWithFormDatabase } from '../../database/db'
import { TaskRepository } from '../../database/task.repository'
import { activeCourseListFixture } from './classroom.fixtures'
import { syncClassroomCourses } from './classroom.sync'

const NOW = () => new Date(2026, 7, 31)

function createFetch(responseBody: unknown, status = 200) {
  return vi.fn(
    async () =>
      ({
        ok: status >= 200 && status < 300,
        status,
        json: vi.fn(async () => responseBody),
      }) as unknown as Response,
  ) as unknown as typeof fetch
}

function createCourseListResponse(
  courses: readonly unknown[],
): Record<string, unknown> {
  return { courses }
}

describe('syncClassroomCourses', () => {
  let database: TaskWithFormDatabase
  let repository: TaskRepository

  beforeEach(() => {
    database = new TaskWithFormDatabase(
      `taskwithform-test-${crypto.randomUUID()}`,
    )
    repository = new TaskRepository(database)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await database.delete()
  })

  it('stores every ACTIVE course, including a course without course work', async () => {
    const result = await syncClassroomCourses({
      fetchImplementation: createFetch(activeCourseListFixture),
      repository,
      now: NOW,
    })

    expect(result).toEqual({
      syncedCourseIds: ['course-math', 'course-empty'],
      syncedTaskCount: 3,
    })
    expect(await repository.getSyncStates()).toEqual([
      { courseId: 'course-empty', fetchedDate: '2026-08-31' },
      { courseId: 'course-math', fetchedDate: '2026-08-31' },
    ])

    const tasks = await repository.getAllTasks()
    expect(tasks.map((task) => task.courseWorkId).sort()).toEqual([
      'work-no-due-date',
      'work-quiz',
      'work-two-forms',
    ])
  })

  it('converts a course work item into the stored task fields', async () => {
    await syncClassroomCourses({
      fetchImplementation: createFetch(activeCourseListFixture),
      repository,
      now: NOW,
    })
    const tasks = await repository.getAllTasks()

    expect(
      tasks.find((task) => task.courseWorkId === 'work-quiz'),
    ).toMatchObject({
      source: 'google-classroom',
      courseId: 'course-math',
      courseName: '数学I',
      subjectName: '数学I',
      courseWorkType: 'ASSIGNMENT',
      title: '確認テスト',
      description: 'Google Formに回答してください。',
      alternateLink: 'https://classroom.google.com/c/course-math/a/work-quiz',
      dueDate: '2026-09-04',
      formUrls: ['https://docs.google.com/forms/d/quiz-form-id/viewform'],
      status: 'unsubmitted',
    })
  })

  it('stores each distribution item once with structured Forms and skips empty materials', async () => {
    await syncClassroomCourses({
      fetchImplementation: createFetch({
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
                creationTime: '2026-08-03T00:00:00Z',
                forms: [],
              },
              {
                itemId: 'material-1',
                itemType: 'courseWorkMaterial',
                title: '資料',
                creationTime: '2026-08-02T00:00:00Z',
                forms: [
                  {
                    resolution: 'unresolved',
                    sourceUrl: 'https://forms.gle/material',
                  },
                ],
              },
              {
                itemId: 'material-2',
                itemType: 'courseWorkMaterial',
                title: 'リンクのみ',
                creationTime: '2026-08-01T00:00:00Z',
                forms: [],
              },
              {
                itemId: 'announcement-1',
                itemType: 'announcement',
                title: '連絡',
                creationTime: '2026-08-04T00:00:00Z',
                forms: [
                  {
                    resolution: 'resolved',
                    sourceUrl: 'https://docs.google.com/forms/d/form/viewform',
                    formId: 'form',
                    formUrl: 'https://docs.google.com/forms/d/form/viewform',
                  },
                ],
              },
            ],
          },
        ],
      }),
      repository,
      now: NOW,
    })

    const tasks = await repository.getAllTasks()
    expect(tasks).toHaveLength(3)
    expect(
      tasks
        .map((task) => [task.itemType, task.itemId])
        .sort((a, b) => String(a[1]).localeCompare(String(b[1]))),
    ).toEqual([
      ['announcement', 'announcement-1'],
      ['courseWorkMaterial', 'material-1'],
      ['courseWork', 'work-1'],
    ])
    expect(tasks.find((task) => task.itemId === 'material-1')?.forms).toEqual([
      {
        resolution: 'unresolved',
        sourceUrl: 'https://forms.gle/material',
      },
    ])
    expect(
      tasks.find((task) => task.itemId === 'announcement-1')?.dueDate,
    ).toBe(undefined)
  })

  it('keeps every Form URL of a task that has more than one Form', async () => {
    await syncClassroomCourses({
      fetchImplementation: createFetch(activeCourseListFixture),
      repository,
      now: NOW,
    })
    const tasks = await repository.getAllTasks()

    expect(
      tasks.find((task) => task.courseWorkId === 'work-two-forms')?.formUrls,
    ).toEqual([
      'https://docs.google.com/forms/d/review-form-id/viewform',
      'https://docs.google.com/forms/d/e/survey-form-id/viewform',
    ])
  })

  it('stores a task without a due date and leaves it undated', async () => {
    await syncClassroomCourses({
      fetchImplementation: createFetch(activeCourseListFixture),
      repository,
      now: NOW,
    })
    const tasks = await repository.getAllTasks()
    const undatedTask = tasks.find(
      (task) => task.courseWorkId === 'work-no-due-date',
    )

    expect(undatedTask?.dueDate).toBeUndefined()
    expect(undatedTask).toMatchObject({
      courseWorkType: 'SHORT_ANSWER_QUESTION',
      formUrls: [],
      status: 'unsubmitted',
    })
  })

  it('keeps the internal UUID and the local status when a course is synced again', async () => {
    await syncClassroomCourses({
      fetchImplementation: createFetch(activeCourseListFixture),
      repository,
      now: NOW,
    })
    const targetTask = (await repository.getAllTasks()).find(
      (task) => task.courseWorkId === 'work-quiz',
    )
    expect(targetTask).toBeDefined()
    await database.tasks.update(targetTask!.id, {
      status: 'submitted',
      submittedAt: '2026-08-30T09:00:00.000Z',
    })

    const renamedFixture = {
      courses: [
        {
          ...activeCourseListFixture.courses[0],
          courseWork: activeCourseListFixture.courses[0]!.courseWork.map(
            (courseWork) =>
              courseWork.courseWorkId === 'work-quiz'
                ? { ...courseWork, title: '確認テスト（再提出）' }
                : courseWork,
          ),
        },
        activeCourseListFixture.courses[1],
      ],
    }

    await syncClassroomCourses({
      fetchImplementation: createFetch(renamedFixture),
      repository,
      now: () => new Date(2026, 8, 1),
    })

    const tasks = await repository.getAllTasks()
    expect(tasks).toHaveLength(3)
    expect(
      tasks.find((task) => task.courseWorkId === 'work-quiz'),
    ).toMatchObject({
      id: targetTask!.id,
      title: '確認テスト（再提出）',
      status: 'submitted',
      submittedAt: '2026-08-30T09:00:00.000Z',
    })
    expect(await repository.getSyncStates()).toEqual([
      { courseId: 'course-empty', fetchedDate: '2026-09-01' },
      { courseId: 'course-math', fetchedDate: '2026-09-01' },
    ])
  })

  it('deletes a course that is no longer ACTIVE after every course is stored', async () => {
    await syncClassroomCourses({
      fetchImplementation: createFetch(activeCourseListFixture),
      repository,
      now: NOW,
    })

    await syncClassroomCourses({
      fetchImplementation: createFetch(
        createCourseListResponse([activeCourseListFixture.courses[1]]),
      ),
      repository,
      now: NOW,
    })

    expect(await repository.getAllTasks()).toEqual([])
    expect(await repository.getSyncStates()).toEqual([
      { courseId: 'course-empty', fetchedDate: '2026-08-31' },
    ])
  })

  it('leaves the database untouched when the response is invalid', async () => {
    await syncClassroomCourses({
      fetchImplementation: createFetch(activeCourseListFixture),
      repository,
      now: NOW,
    })
    const tasksBefore = await repository.getAllTasks()
    const syncStatesBefore = await repository.getSyncStates()

    await expect(
      syncClassroomCourses({
        fetchImplementation: createFetch(
          createCourseListResponse([
            { id: 'course-math', name: '数学I', courseWork: [] },
            { id: 'course-broken', courseWork: [] },
          ]),
        ),
        repository,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: 'invalid_backend_response' })

    expect(await repository.getAllTasks()).toEqual(tasksBefore)
    expect(await repository.getSyncStates()).toEqual(syncStatesBefore)
  })

  it('surfaces a backend failure without touching the database', async () => {
    await syncClassroomCourses({
      fetchImplementation: createFetch(activeCourseListFixture),
      repository,
      now: NOW,
    })
    const tasksBefore = await repository.getAllTasks()

    await expect(
      syncClassroomCourses({
        fetchImplementation: createFetch(
          { error: { code: 'classroom_unavailable' } },
          502,
        ),
        repository,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: 'classroom_unavailable' })

    expect(await repository.getAllTasks()).toEqual(tasksBefore)
  })

  it('rolls the whole sync back when one course snapshot fails to be stored', async () => {
    await syncClassroomCourses({
      fetchImplementation: createFetch(activeCourseListFixture),
      repository,
      now: NOW,
    })
    const tasksBefore = await repository.getAllTasks()

    // The second course fails after the first one has already been written.
    const originalReplace = TaskRepository.prototype.replaceCourseSnapshot
    const replaceCourseSnapshot = vi
      .spyOn(repository, 'replaceCourseSnapshot')
      .mockImplementation(async (snapshot) => {
        if (snapshot.courseId === 'course-empty') {
          throw new Error('write failed')
        }

        return originalReplace.call(repository, snapshot)
      })

    await expect(
      syncClassroomCourses({
        fetchImplementation: createFetch({
          courses: [
            {
              ...activeCourseListFixture.courses[0],
              name: '数学I（改称）',
              courseWork: [],
            },
            activeCourseListFixture.courses[1],
          ],
        }),
        repository,
        now: () => new Date(2026, 8, 1),
      }),
    ).rejects.toThrow('write failed')

    expect(replaceCourseSnapshot).toHaveBeenCalledTimes(2)
    expect(await repository.getAllTasks()).toEqual(tasksBefore)
    expect(await repository.getSyncStates()).toEqual([
      { courseId: 'course-empty', fetchedDate: '2026-08-31' },
      { courseId: 'course-math', fetchedDate: '2026-08-31' },
    ])
  })

  it('clears every stored course when Classroom reports no ACTIVE course', async () => {
    await syncClassroomCourses({
      fetchImplementation: createFetch(activeCourseListFixture),
      repository,
      now: NOW,
    })

    await expect(
      syncClassroomCourses({
        fetchImplementation: createFetch(createCourseListResponse([])),
        repository,
        now: NOW,
      }),
    ).resolves.toEqual({ syncedCourseIds: [], syncedTaskCount: 0 })

    expect(await repository.getAllTasks()).toEqual([])
    expect(await repository.getSyncStates()).toEqual([])
  })

  it('stores an empty description and a repeated Form URL without failing', async () => {
    await syncClassroomCourses({
      fetchImplementation: createFetch(
        createCourseListResponse([
          {
            id: 'course-1',
            name: '数学I',
            courseWork: [
              {
                courseWorkId: 'work-1',
                courseWorkType: 'ASSIGNMENT',
                title: '確認テスト',
                description: '',
                forms: [
                  {
                    formId: 'form-id',
                    formUrl: 'https://docs.google.com/forms/d/form-id/viewform',
                  },
                  {
                    formId: 'form-id',
                    formUrl: 'https://docs.google.com/forms/d/form-id/viewform',
                  },
                ],
              },
            ],
          },
        ]),
      ),
      repository,
      now: NOW,
    })

    expect(await repository.getAllTasks()).toMatchObject([
      {
        description: '',
        formUrls: ['https://docs.google.com/forms/d/form-id/viewform'],
      },
    ])
  })
})

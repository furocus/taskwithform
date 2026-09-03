import 'fake-indexeddb/auto'

import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TaskWithFormDatabase } from '../../database/db'
import { TaskRepository } from '../../database/task.repository'
import { activeCourseListFixture } from './classroom.fixtures'
import { syncClassroomCourses } from './classroom.sync'
import { toTask, useTasks } from './useTasks'
import type { TaskRecord } from '../../database/database.types'

const NOW = () => new Date(2026, 7, 31, 23, 59)

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

function createRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-uuid',
    externalKey: '["google-classroom","course-1","work-1"]',
    source: 'google-classroom',
    courseId: 'course-1',
    courseName: '数学I',
    courseWorkId: 'work-1',
    courseWorkType: 'ASSIGNMENT',
    subjectName: '数学',
    title: '確認テスト',
    formUrls: ['https://docs.google.com/forms/d/form-id/viewform'],
    status: 'unsubmitted',
    ...overrides,
  }
}

async function waitForStatus(
  result: ReturnType<typeof useTasks>,
  expected: 'loading' | 'empty' | 'error' | 'ready',
) {
  await vi.waitFor(() => expect(result.status.value).toBe(expected))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

function responseFor(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response
}

describe('useTasks', () => {
  let database: TaskWithFormDatabase
  let repository: TaskRepository

  beforeEach(() => {
    database = new TaskWithFormDatabase(
      `taskwithform-use-tasks-test-${crypto.randomUUID()}`,
    )
    repository = new TaskRepository(database)
  })

  afterEach(async () => {
    await database.delete()
    vi.restoreAllMocks()
  })

  it('connects Classroom API, sync, IndexedDB, and the UI task shape', async () => {
    const fetchImplementation = createFetch(activeCourseListFixture)
    const result = useTasks({
      repository,
      sync: syncClassroomCourses,
      fetchImplementation,
      now: NOW,
    })

    await result.reload()

    expect(result.status.value).toBe('ready')
    expect(result.error.value).toBeNull()
    expect(result.tasks.value.map((task) => task.id)).toHaveLength(3)
    expect(result.tasks.value[0]).toMatchObject({
      id: expect.any(String),
      index: 1,
      title: '確認テスト',
      subject: '数学I',
      dueDate: '9月4日',
      warning: 'あと4日',
      answerStatus: 'unreviewed',
    })
    expect(result.tasks.value.at(-1)).toMatchObject({
      title: '質問への回答',
      dueDate: '期限なし',
      warning: '',
    })
    expect(fetchImplementation).toHaveBeenCalledWith(
      '/api/classroom/courses/coursework',
      { credentials: 'same-origin' },
    )
  })

  it('maps submitted records to submitted and all other records to unreviewed', () => {
    expect(
      toTask(createRecord({ status: 'submitted' }), 1, NOW()),
    ).toMatchObject({ answerStatus: 'submitted' })
    expect(
      toTask(createRecord({ status: 'untracked' }), 1, NOW()),
    ).toMatchObject({ answerStatus: 'unreviewed' })
  })

  it('calculates today and expired warnings from the injected local date', () => {
    expect(
      toTask(createRecord({ dueDate: '2026-08-31' }), 1, NOW()),
    ).toMatchObject({ warning: '今日まで！' })
    expect(
      toTask(createRecord({ dueDate: '2026-08-30' }), 1, NOW()),
    ).toMatchObject({ warning: '期限切れ' })
  })

  it('recovers after a failed initial load when retry is requested', async () => {
    const sync = vi
      .fn()
      .mockRejectedValueOnce(new Error('Classroom unavailable'))
      .mockResolvedValueOnce({
        syncedCourseIds: ['course-1'],
        syncedTaskCount: 1,
      })
    const getUnsubmittedTasks = vi.fn().mockResolvedValue([createRecord()])

    const result = useTasks({
      sync,
      repository: { getUnsubmittedTasks },
      now: NOW,
    })
    await waitForStatus(result, 'error')

    expect(result.status.value).toBe('error')
    expect(result.tasks.value).toEqual([])

    await result.reload()

    expect(result.status.value).toBe('ready')
    expect(result.tasks.value[0]?.id).toBe('task-uuid')
    expect(sync).toHaveBeenCalledTimes(2)
  })

  it('treats a post-sync repository failure as an error', async () => {
    const result = useTasks({
      sync: vi.fn().mockResolvedValue({
        syncedCourseIds: ['course-1'],
        syncedTaskCount: 1,
      }),
      repository: {
        getUnsubmittedTasks: vi
          .fn()
          .mockRejectedValue(new Error('IndexedDB unavailable')),
      },
      now: NOW,
    })
    await waitForStatus(result, 'error')

    expect(result.status.value).toBe('error')
    expect(result.tasks.value).toEqual([])
    expect(result.error.value).toMatchObject({
      message: 'IndexedDB unavailable',
    })
  })

  it('serializes real syncs so the latest API response remains in DB and UI', async () => {
    const firstResponse = deferred<unknown>()
    const secondResponse = deferred<unknown>()
    let requestCount = 0
    let requestsInFlight = 0
    let maxRequestsInFlight = 0
    const fetchImplementation = vi.fn(async () => {
      requestCount += 1
      requestsInFlight += 1
      maxRequestsInFlight = Math.max(maxRequestsInFlight, requestsInFlight)

      try {
        const body = await (requestCount === 1
          ? firstResponse.promise
          : secondResponse.promise)
        return responseFor(body)
      } finally {
        requestsInFlight -= 1
      }
    }) as unknown as typeof fetch
    const latestFixture = {
      courses: [
        {
          ...activeCourseListFixture.courses[0]!,
          courseWork: activeCourseListFixture.courses[0]!.courseWork.map(
            (courseWork) =>
              courseWork.courseWorkId === 'work-quiz'
                ? { ...courseWork, title: '最新の確認テスト' }
                : courseWork,
          ),
        },
        activeCourseListFixture.courses[1]!,
      ],
    }
    const result = useTasks({
      repository,
      sync: syncClassroomCourses,
      fetchImplementation,
      now: NOW,
    })

    expect(fetchImplementation).toHaveBeenCalledTimes(1)
    const obsoleteReload = result.reload()
    const latestReload = result.reload()
    expect(fetchImplementation).toHaveBeenCalledTimes(1)

    firstResponse.resolve(activeCourseListFixture)
    await vi.waitFor(() => expect(fetchImplementation).toHaveBeenCalledTimes(2))

    secondResponse.resolve(latestFixture)
    await Promise.all([obsoleteReload, latestReload])

    expect(result.status.value).toBe('ready')
    expect(result.tasks.value[0]).toMatchObject({
      title: '最新の確認テスト',
    })
    expect(
      (await repository.getAllTasks()).find(
        (task) => task.courseWorkId === 'work-quiz',
      ),
    ).toMatchObject({ title: '最新の確認テスト' })
    expect(maxRequestsInFlight).toBe(1)
  })

  it('serializes syncs across a page unmount and remount', async () => {
    const firstResponse = deferred<unknown>()
    const secondResponse = deferred<unknown>()
    let requestCount = 0
    let requestsInFlight = 0
    let maxRequestsInFlight = 0
    const fetchImplementation = vi.fn(async () => {
      requestCount += 1
      requestsInFlight += 1
      maxRequestsInFlight = Math.max(maxRequestsInFlight, requestsInFlight)

      try {
        const body = await (requestCount === 1
          ? firstResponse.promise
          : secondResponse.promise)
        return responseFor(body)
      } finally {
        requestsInFlight -= 1
      }
    }) as unknown as typeof fetch
    const latestFixture = {
      courses: [
        {
          ...activeCourseListFixture.courses[0]!,
          courseWork: activeCourseListFixture.courses[0]!.courseWork.map(
            (courseWork) =>
              courseWork.courseWorkId === 'work-quiz'
                ? { ...courseWork, title: '再マウント後の最新課題' }
                : courseWork,
          ),
        },
        activeCourseListFixture.courses[1]!,
      ],
    }
    let oldResult: ReturnType<typeof useTasks> | undefined
    let latestResult: ReturnType<typeof useTasks> | undefined
    const OldPage = defineComponent({
      setup() {
        oldResult = useTasks({
          repository,
          sync: syncClassroomCourses,
          fetchImplementation,
          now: NOW,
        })
        return () => h('div')
      },
    })
    const oldWrapper = mount(OldPage)

    expect(oldResult).toBeDefined()
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
    oldWrapper.unmount()

    const NewPage = defineComponent({
      setup() {
        latestResult = useTasks({
          repository,
          sync: syncClassroomCourses,
          fetchImplementation,
          now: NOW,
        })
        return () => h('div')
      },
    })
    const newWrapper = mount(NewPage)

    expect(latestResult).toBeDefined()
    expect(fetchImplementation).toHaveBeenCalledTimes(1)

    firstResponse.resolve(activeCourseListFixture)
    await vi.waitFor(() => expect(fetchImplementation).toHaveBeenCalledTimes(2))

    secondResponse.resolve(latestFixture)
    await vi.waitFor(() => expect(latestResult?.status.value).toBe('ready'))

    expect(latestResult?.tasks.value[0]).toMatchObject({
      title: '再マウント後の最新課題',
    })
    expect(
      (await repository.getAllTasks()).find(
        (task) => task.courseWorkId === 'work-quiz',
      ),
    ).toMatchObject({ title: '再マウント後の最新課題' })
    expect(maxRequestsInFlight).toBe(1)

    newWrapper.unmount()
  })

  it('does not block a sync using a different Repository object', async () => {
    const firstSyncCompletion = deferred<void>()
    const firstSync = vi.fn(() => firstSyncCompletion.promise)
    const secondSync = vi.fn().mockResolvedValue(undefined)
    const firstResult = useTasks({
      repository: { getUnsubmittedTasks: vi.fn().mockResolvedValue([]) },
      sync: firstSync,
      now: NOW,
    })
    const secondResult = useTasks({
      repository: { getUnsubmittedTasks: vi.fn().mockResolvedValue([]) },
      sync: secondSync,
      now: NOW,
    })

    await waitForStatus(secondResult, 'empty')
    expect(secondSync).toHaveBeenCalledOnce()
    expect(firstSync).toHaveBeenCalledOnce()

    firstSyncCompletion.resolve()
    await waitForStatus(firstResult, 'empty')
  })

  it('updates a task answer status without changing its UUID', async () => {
    const result = useTasks({
      sync: vi
        .fn()
        .mockResolvedValue({ syncedCourseIds: [], syncedTaskCount: 0 }),
      repository: {
        getUnsubmittedTasks: vi.fn().mockResolvedValue([createRecord()]),
      },
      now: NOW,
    })
    await waitForStatus(result, 'ready')

    result.updateTaskAnswerStatus('task-uuid', 'needsReview')

    expect(result.tasks.value[0]).toMatchObject({
      id: 'task-uuid',
      answerStatus: 'needsReview',
    })
  })
})

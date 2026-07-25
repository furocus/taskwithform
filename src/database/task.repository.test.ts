import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { TaskRecordInput } from './database.types'
import { TaskWithFormDatabase } from './db'
import { TaskRepository } from './task.repository'

function createTaskInput(
  overrides: Partial<TaskRecordInput> = {},
): TaskRecordInput {
  return {
    source: 'google-classroom',
    courseId: 'course-1',
    courseName: '数学I',
    courseWorkId: 'work-1',
    courseWorkType: 'ASSIGNMENT',
    subjectName: '数学',
    title: '一次方程式',
    formUrls: [],
    status: 'unsubmitted',
    ...overrides,
  }
}

describe('TaskRepository', () => {
  let database: TaskWithFormDatabase
  let repository: TaskRepository

  beforeEach(() => {
    database = new TaskWithFormDatabase(
      `taskwithform-test-${crypto.randomUUID()}`,
    )
    repository = new TaskRepository(database)
  })

  afterEach(async () => {
    await database.delete()
  })

  it('updates an existing external task without changing its internal UUID', async () => {
    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-07-25',
      tasks: [createTaskInput()],
    })
    const [initialTask] = await repository.getAllTasks()

    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-07-26',
      tasks: [createTaskInput({ title: '一次方程式（更新）' })],
    })
    const tasks = await repository.getAllTasks()

    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      id: initialTask?.id,
      title: '一次方程式（更新）',
    })
    expect(await repository.getSyncStates()).toEqual([
      { courseId: 'course-1', fetchedDate: '2026-07-26' },
    ])
  })

  it('stores the same courseWorkId from different courses as separate tasks', async () => {
    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-07-26',
      tasks: [createTaskInput()],
    })
    await repository.replaceCourseSnapshot({
      courseId: 'course-2',
      fetchedDate: '2026-07-26',
      tasks: [
        createTaskInput({
          courseId: 'course-2',
          courseName: '英語',
          courseWorkId: 'work-1',
        }),
      ],
    })

    const tasks = await repository.getAllTasks()
    expect(tasks).toHaveLength(2)
    expect(new Set(tasks.map((task) => task.externalKey)).size).toBe(2)
  })

  it('updates and deletes only the course whose snapshot succeeded', async () => {
    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-07-25',
      tasks: [createTaskInput()],
    })
    await repository.replaceCourseSnapshot({
      courseId: 'course-2',
      fetchedDate: '2026-07-25',
      tasks: [
        createTaskInput({
          courseId: 'course-2',
          courseWorkId: 'work-2',
        }),
      ],
    })

    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-07-26',
      tasks: [],
    })

    expect(await repository.getAllTasks()).toMatchObject([
      { courseId: 'course-2', courseWorkId: 'work-2' },
    ])
    expect(await repository.getSyncStates()).toEqual([
      { courseId: 'course-1', fetchedDate: '2026-07-26' },
      { courseId: 'course-2', fetchedDate: '2026-07-25' },
    ])
  })

  it('removes tasks and sync state for inactive courses', async () => {
    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-07-26',
      tasks: [createTaskInput()],
    })
    await repository.replaceCourseSnapshot({
      courseId: 'course-2',
      fetchedDate: '2026-07-26',
      tasks: [
        createTaskInput({
          courseId: 'course-2',
          courseWorkId: 'work-2',
        }),
      ],
    })

    await repository.removeInactiveCourses(['course-1'])

    expect(await repository.getAllTasks()).toMatchObject([
      { courseId: 'course-1' },
    ])
    expect(await repository.getSyncStates()).toEqual([
      { courseId: 'course-1', fetchedDate: '2026-07-26' },
    ])
  })

  it('removes submittedAt when the current status is unsubmitted', async () => {
    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-07-25',
      tasks: [
        createTaskInput({
          status: 'submitted',
          submittedAt: '2026-07-25T09:30:00.000Z',
        }),
      ],
    })

    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-07-26',
      tasks: [
        createTaskInput({
          status: 'unsubmitted',
          submittedAt: '2026-07-25T09:30:00.000Z',
        }),
      ],
    })

    const [task] = await repository.getAllTasks()
    expect(task?.status).toBe('unsubmitted')
    expect(task?.submittedAt).toBeUndefined()
  })

  it('sorts unsubmitted tasks by due date and puts undated tasks last', async () => {
    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-07-26',
      tasks: [
        createTaskInput({
          courseWorkId: 'undated',
          title: '期限なし',
        }),
        createTaskInput({
          courseWorkId: 'later',
          title: '後の課題',
          dueDate: '2026-07-28',
        }),
        createTaskInput({
          courseWorkId: 'earlier',
          title: '先の課題',
          dueDate: '2026-07-27',
        }),
        createTaskInput({
          courseWorkId: 'submitted',
          title: '提出済み',
          dueDate: '2026-07-26',
          status: 'submitted',
          submittedAt: '2026-07-26T01:00:00.000Z',
        }),
      ],
    })

    const tasks = await repository.getUnsubmittedTasks()
    expect(tasks.map((task) => task.courseWorkId)).toEqual([
      'earlier',
      'later',
      'undated',
    ])
  })

  it('returns only unsubmitted dated tasks inside the calendar range', async () => {
    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-07-26',
      tasks: [
        createTaskInput({
          courseWorkId: 'inside',
          dueDate: '2026-07-27',
        }),
        createTaskInput({
          courseWorkId: 'outside',
          dueDate: '2026-08-01',
        }),
        createTaskInput({
          courseWorkId: 'undated',
        }),
        createTaskInput({
          courseWorkId: 'submitted',
          dueDate: '2026-07-28',
          status: 'submitted',
        }),
      ],
    })

    const tasks = await repository.getUnsubmittedTasksInDateRange(
      '2026-07-26',
      '2026-07-31',
    )
    expect(tasks.map((task) => task.courseWorkId)).toEqual(['inside'])
  })

  it('rolls back a duplicate snapshot and strips unexpected personal fields', async () => {
    const unsafeTask = {
      ...createTaskInput(),
      userId: 'google-user-id',
      email: 'student@example.com',
    } as TaskRecordInput

    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-07-25',
      tasks: [unsafeTask],
    })

    await expect(
      repository.replaceCourseSnapshot({
        courseId: 'course-1',
        fetchedDate: '2026-07-26',
        tasks: [createTaskInput(), createTaskInput()],
      }),
    ).rejects.toThrow('duplicate task')

    const [task] = await repository.getAllTasks()
    expect(task).not.toHaveProperty('userId')
    expect(task).not.toHaveProperty('email')
    expect(await repository.getSyncStates()).toEqual([
      { courseId: 'course-1', fetchedDate: '2026-07-25' },
    ])
  })

  it('clears tasks and sync state together on logout', async () => {
    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-07-26',
      tasks: [createTaskInput()],
    })

    await repository.clearLocalData()

    expect(await repository.getAllTasks()).toEqual([])
    expect(await repository.getSyncStates()).toEqual([])
  })
})

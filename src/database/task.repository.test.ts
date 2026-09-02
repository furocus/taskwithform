import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { TaskRecordInput } from './database.types'
import { TaskWithFormDatabase } from './db'
import { TaskRepository } from './task.repository'

function createTaskInput(
  overrides: Partial<TaskRecordInput> = {},
): TaskRecordInput {
  return {
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

  it('deletes only target course tasks when replacing it with an empty snapshot', async () => {
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

  it('rolls back when a task courseId does not match its snapshot', async () => {
    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-07-25',
      tasks: [createTaskInput()],
    })

    await expect(
      repository.replaceCourseSnapshot({
        courseId: 'course-1',
        fetchedDate: '2026-07-26',
        tasks: [
          createTaskInput({
            courseId: 'course-2',
            courseName: '英語',
          }),
        ],
      }),
    ).rejects.toThrow('does not match task courseId')

    expect(await repository.getAllTasks()).toMatchObject([
      {
        courseId: 'course-1',
        courseName: '数学I',
        courseWorkId: 'work-1',
      },
    ])
    expect(await repository.getSyncStates()).toEqual([
      { courseId: 'course-1', fetchedDate: '2026-07-25' },
    ])
  })

  it('replaces active course snapshots and drops the inactive ones at once', async () => {
    await repository.replaceCourseSnapshot({
      courseId: 'course-stale',
      fetchedDate: '2026-07-25',
      tasks: [createTaskInput({ courseId: 'course-stale' })],
    })

    await repository.replaceActiveCourseSnapshots([
      {
        courseId: 'course-1',
        fetchedDate: '2026-07-26',
        tasks: [createTaskInput()],
      },
      { courseId: 'course-2', fetchedDate: '2026-07-26', tasks: [] },
    ])

    expect(
      (await repository.getAllTasks()).map((task) => task.courseId),
    ).toEqual(['course-1'])
    expect(await repository.getSyncStates()).toEqual([
      { courseId: 'course-1', fetchedDate: '2026-07-26' },
      { courseId: 'course-2', fetchedDate: '2026-07-26' },
    ])
  })

  it('rolls back every course when one snapshot is rejected', async () => {
    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-07-25',
      tasks: [createTaskInput()],
    })

    await expect(
      repository.replaceActiveCourseSnapshots([
        {
          courseId: 'course-1',
          fetchedDate: '2026-07-26',
          tasks: [createTaskInput({ title: '一次方程式（更新）' })],
        },
        {
          courseId: 'course-2',
          fetchedDate: '2026-07-26',
          tasks: [createTaskInput({ courseId: 'course-3' })],
        },
      ]),
    ).rejects.toThrow('does not match task courseId')

    expect(await repository.getAllTasks()).toMatchObject([
      { courseId: 'course-1', title: '一次方程式' },
    ])
    expect(await repository.getSyncStates()).toEqual([
      { courseId: 'course-1', fetchedDate: '2026-07-25' },
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

  //同日期限の課題を科目名順に固定
  it('sorts tasks with the same due date by title', async () => {
    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-07-26',
      tasks: [
        createTaskInput({
          courseWorkId: 'task-z',
          title: '数学',
          dueDate: '2026-07-27',
        }),
        createTaskInput({
          courseWorkId: 'task-a',
          title: '英語',
          dueDate: '2026-07-27',
        }),
        createTaskInput({
          courseWorkId: 'task-m',
          title: '国語',
          dueDate: '2026-07-27',
        }),
      ],
    })

    const tasks = await repository.getUnsubmittedTasksInDateRange(
      '2026-07-27',
      '2026-07-27',
    )

    expect(tasks.map((task) => task.title)).toEqual(['英語', '国語', '数学'])
  })

  //終了日が開始日より前
  it('rejects a calendar range whose start date is after its end date', async () => {
    await expect(
      repository.getUnsubmittedTasksInDateRange('2026-07-31', '2026-07-26'),
    ).rejects.toThrow('startDate must not be after endDate')
  })

  //型式不一致
  it('rejects a start date that is not in YYYY-MM-DD format', async () => {
    await expect(
      repository.getUnsubmittedTasksInDateRange('2026-2-01', '2026-02-28'),
    ).rejects.toThrow('startDate must be in YYYY-MM-DD format.')
  })
  it('rejects an end date that is not in YYYY-MM-DD format', async () => {
    await expect(
      repository.getUnsubmittedTasksInDateRange('2026-02-01', '2026-2-28'),
    ).rejects.toThrow('endDate must be in YYYY-MM-DD format.')
  })

  //存在しない日付が入力された
  it('rejects a non-existent date', async () => {
    await expect(
      repository.getUnsubmittedTasksInDateRange('2026-02-29', '2026-03-01'),
    ).rejects.toThrow('startDate must be a valid date.')
  })
  it('rejects a non-existent day in a month', async () => {
    await expect(
      repository.getUnsubmittedTasksInDateRange('2026-04-31', '2026-05-01'),
    ).rejects.toThrow('startDate must be a valid date.')
  })
  it('rejects a non-existent month', async () => {
    await expect(
      repository.getUnsubmittedTasksInDateRange('2026-13-01', '2026-12-31'),
    ).rejects.toThrow('startDate must be a valid date.')
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
    expect(task?.source).toBe('google-classroom')
    expect(task).not.toHaveProperty('userId')
    expect(task).not.toHaveProperty('email')
    expect(await repository.getSyncStates()).toEqual([
      { courseId: 'course-1', fetchedDate: '2026-07-25' },
    ])
  })

  it('clears tasks and sync state together', async () => {
    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-07-26',
      tasks: [createTaskInput()],
    })

    await repository.clearLocalData()

    expect(await repository.getAllTasks()).toEqual([])
    expect(await repository.getSyncStates()).toEqual([])
  })
  it('groups unsubmitted tasks by due date', async () => {
    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-07-26',
      tasks: [
        createTaskInput({
          courseWorkId: 'task-1',
          title: '数学',
          dueDate: '2026-07-27',
        }),
        createTaskInput({
          courseWorkId: 'task-2',
          title: '英語',
          dueDate: '2026-07-27',
        }),
        createTaskInput({
          courseWorkId: 'task-3',
          title: '国語',
          dueDate: '2026-07-28',
        }),
        createTaskInput({
          courseWorkId: 'task-4',
          title: '期限なし',
        }),
        createTaskInput({
          courseWorkId: 'task-5',
          title: '提出済み',
          dueDate: '2026-07-27',
          status: 'submitted',
        }),
      ],
    })

    const tasks = await repository.getTasksGroupedByDueDate(
      '2026-07-27',
      '2026-07-28',
    )

    expect(tasks['2026-07-27']).toHaveLength(2)
    expect(tasks['2026-07-28']).toHaveLength(1)

    expect(tasks['2026-07-27']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          courseWorkId: 'task-1',
        }),
        expect.objectContaining({
          courseWorkId: 'task-2',
        }),
      ]),
    )

    expect(tasks['2026-07-28']).toEqual([
      expect.objectContaining({
        courseWorkId: 'task-3',
      }),
    ])
  })

  //月境界テスト
  it('groups tasks correctly across a month boundary', async () => {
    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-07-31',
      tasks: [
        createTaskInput({
          courseWorkId: 'july-last',
          title: '7月末',
          dueDate: '2026-07-31',
        }),
        createTaskInput({
          courseWorkId: 'august-first',
          title: '8月初日',
          dueDate: '2026-08-01',
        }),
      ],
    })

    const tasks = await repository.getTasksGroupedByDueDate(
      '2026-07-31',
      '2026-08-01',
    )

    expect(Object.keys(tasks)).toEqual(['2026-07-31', '2026-08-01'])

    expect(tasks['2026-07-31']).toHaveLength(1)
    expect(tasks['2026-08-01']).toHaveLength(1)
  })

  //年境界テスト
  it('groups tasks correctly across a year boundary', async () => {
    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-12-30',
      tasks: [
        createTaskInput({
          courseWorkId: 'task-1',
          title: '年末の課題',
          dueDate: '2026-12-31',
        }),
        createTaskInput({
          courseWorkId: 'task-2',
          title: '年始の課題',
          dueDate: '2027-01-01',
        }),
      ],
    })

    const tasks = await repository.getTasksGroupedByDueDate(
      '2026-12-31',
      '2027-01-01',
    )

    expect(tasks).toEqual({
      '2026-12-31': [
        expect.objectContaining({
          courseWorkId: 'task-1',
        }),
      ],
      '2027-01-01': [
        expect.objectContaining({
          courseWorkId: 'task-2',
        }),
      ],
    })
  })

  //うるう年テスト
  it('groups tasks correctly across a leap day', async () => {
    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2028-02-27',
      tasks: [
        createTaskInput({
          courseWorkId: 'feb-28',
          title: '2月28日の課題',
          dueDate: '2028-02-28',
        }),
        createTaskInput({
          courseWorkId: 'feb-29',
          title: 'うるう日の課題',
          dueDate: '2028-02-29',
        }),
        createTaskInput({
          courseWorkId: 'mar-01',
          title: '3月1日の課題',
          dueDate: '2028-03-01',
        }),
      ],
    })

    const tasks = await repository.getTasksGroupedByDueDate(
      '2028-02-28',
      '2028-03-01',
    )

    expect(tasks['2028-02-28']).toEqual([
      expect.objectContaining({
        courseWorkId: 'feb-28',
      }),
    ])

    expect(tasks['2028-02-29']).toEqual([
      expect.objectContaining({
        courseWorkId: 'feb-29',
      }),
    ])

    expect(tasks['2028-03-01']).toEqual([
      expect.objectContaining({
        courseWorkId: 'mar-01',
      }),
    ])
  })

  // 同一期限日かつ同一タイトルの課題も安定した順序で取得する
  it('sorts tasks with the same due date and title by course name', async () => {
    await repository.replaceCourseSnapshot({
      courseId: 'course-a',
      fetchedDate: '2026-08-19',
      tasks: [
        createTaskInput({
          courseId: 'course-a',
          courseName: '数学',
          courseWorkId: 'work-a',
          title: '課題',
          dueDate: '2026-08-20',
        }),
      ],
    })

    await repository.replaceCourseSnapshot({
      courseId: 'course-b',
      fetchedDate: '2026-08-19',
      tasks: [
        createTaskInput({
          courseId: 'course-b',
          courseName: '英語',
          courseWorkId: 'work-b',
          title: '課題',
          dueDate: '2026-08-20',
        }),
      ],
    })

    const result = await repository.getTasksGroupedByDueDate(
      '2026-08-20',
      '2026-08-20',
    )

    expect(result['2026-08-20']).toEqual([
      expect.objectContaining({
        courseName: '英語',
        title: '課題',
      }),
      expect.objectContaining({
        courseName: '数学',
        title: '課題',
      }),
    ])
  })
})

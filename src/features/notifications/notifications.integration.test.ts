import 'fake-indexeddb/auto'

import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskWithFormDatabase } from '../../database/db'
import { TaskRepository } from '../../database/task.repository'
import type { TaskRecord } from '../../database/database.types'
import { useCalendar } from '../calendar/useCalendar'
import { activeCourseListFixture } from '../tasks/classroom.fixtures'
import { syncClassroomCourses } from '../tasks/classroom.sync'
import {
  createTaskSyncContext,
  type TaskSyncContext,
} from '../tasks/taskSyncContext'
import { useDeadlineNotifications } from './useDeadlineNotifications'

const NOW = () => new Date(2026, 8, 4, 9)

function createStoredTask(
  id: string,
  dueDate: string | undefined,
  status: TaskRecord['status'] = 'unsubmitted',
): TaskRecord {
  return {
    id,
    externalKey: JSON.stringify(['google-classroom', 'course-1', id]),
    source: 'google-classroom',
    courseId: 'course-1',
    courseName: '数学I',
    courseWorkId: id,
    courseWorkType: 'ASSIGNMENT',
    subjectName: '数学I',
    title: id,
    formUrls: [],
    ...(dueDate === undefined ? {} : { dueDate }),
    status,
  }
}

function responseFor(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response
}

describe('Classroom sync notification and calendar integration', () => {
  let database: TaskWithFormDatabase
  let repository: TaskRepository

  beforeEach(() => {
    database = new TaskWithFormDatabase(
      `taskwithform-notification-integration-${crypto.randomUUID()}`,
    )
    repository = new TaskRepository(database)
  })

  afterEach(async () => {
    await database.delete()
  })

  it('syncs Classroom into IndexedDB once and feeds notifications and calendar', async () => {
    const fetchImplementation = vi.fn(async () =>
      responseFor(activeCourseListFixture),
    ) as unknown as typeof fetch
    const syncContext = createTaskSyncContext({
      repository,
      sync: syncClassroomCourses,
      fetchImplementation,
      now: NOW,
    })
    const displayedMonth = ref(new Date(2026, 8, 1))
    let notification: ReturnType<typeof useDeadlineNotifications>
    let calendar: ReturnType<typeof useCalendar>
    const Harness = defineComponent({
      setup() {
        notification = useDeadlineNotifications({
          now: NOW,
          syncContext,
        })
        calendar = useCalendar(displayedMonth, undefined, { syncContext })
        return () => h('div')
      },
    })
    const wrapper = mount(Harness)

    await syncContext.start()
    await vi.waitFor(() => expect(notification!.status.value).toBe('ready'))
    await vi.waitFor(() => expect(calendar!.status.value).toBe('ready'))

    expect(fetchImplementation).toHaveBeenCalledOnce()
    expect(notification!.notifications.value.map((task) => task.title)).toEqual(
      ['確認テスト'],
    )
    expect(calendar!.tasksByDate.value['2026-09-04']?.[0]?.title).toBe(
      '確認テスト',
    )
    expect(await repository.getAllTasks()).toHaveLength(3)

    wrapper.unmount()
    syncContext.dispose()
  })

  it('includes only today and unsubmitted records at the local date boundary', async () => {
    await database.tasks.bulkPut([
      createStoredTask('yesterday', '2026-09-03'),
      createStoredTask('today', '2026-09-04'),
      createStoredTask('tomorrow', '2026-09-05'),
      createStoredTask('no-due-date', undefined),
      createStoredTask('submitted-today', '2026-09-04', 'submitted'),
    ])

    const result = useDeadlineNotifications({ repository, now: NOW })
    await vi.waitFor(() => expect(result.status.value).toBe('ready'))

    expect(result.notifications.value.map((task) => task.id)).toEqual(['today'])
    expect(result.date.value).toBe('2026-09-04')
  })
})

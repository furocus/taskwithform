import {
  computed,
  getCurrentInstance,
  onUnmounted,
  ref,
  type ComputedRef,
  type Ref,
} from 'vue'
import type { TaskRecord } from '../../database/database.types'
import {
  taskRepository as defaultTaskRepository,
  type TaskRepository,
} from '../../database/task.repository'
import {
  syncClassroomCourses as defaultSyncClassroomCourses,
  type SyncClassroomCoursesOptions,
  type SyncClassroomCoursesResult,
} from './classroom.sync'
import type { AnswerStatus, Task } from './task.types'

export type TaskListStatus = 'loading' | 'empty' | 'error' | 'ready'

export type SyncClassroomCoursesImplementation = (
  options?: SyncClassroomCoursesOptions,
) => Promise<SyncClassroomCoursesResult | void>

export interface UseTasksOptions {
  /** Injectable sync implementation, primarily useful for tests. */
  sync?: SyncClassroomCoursesImplementation
  /** Verbose alias for callers that prefer the production function name. */
  syncClassroomCourses?: SyncClassroomCoursesImplementation
  /** Repository used for the post-sync task read and passed to sync. */
  repository?: Pick<TaskRepository, 'getUnsubmittedTasks'> | TaskRepository
  /** Fetch implementation passed to the Classroom API by the default sync. */
  fetchImplementation?: SyncClassroomCoursesOptions['fetchImplementation']
  /** Clock used to calculate local-date due warnings. */
  now?: () => Date
}

export interface UseTasksResult {
  status: Ref<TaskListStatus>
  tasks: Ref<Task[]>
  error: Ref<unknown>
  /** Starts a fresh sync and task read. */
  reload: () => Promise<void>
  /** Alias used by retry controls. */
  retry: () => Promise<void>
  /** Updates only the answer status of a currently displayed task. */
  updateTaskAnswerStatus: (taskId: string, answerStatus: AnswerStatus) => void
  /** A stable course id for consumers that need a fallback course color. */
  courseId: ComputedRef<string>
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

function formatDueDate(dueDate: string | undefined): string {
  if (dueDate === undefined) return '期限なし'

  const [, month, day] = dueDate.split('-')
  return `${Number(month)}月${Number(day)}日`
}

function dateOnlyToUtcMilliseconds(dateOnly: string): number {
  const [year, month, day] = dateOnly.split('-').map(Number)
  return Date.UTC(year!, month! - 1, day!)
}

function toLocalDateOnly(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDueWarning(dueDate: string | undefined, now: Date): string {
  if (dueDate === undefined) return ''

  const remainingDays = Math.round(
    (dateOnlyToUtcMilliseconds(dueDate) -
      dateOnlyToUtcMilliseconds(toLocalDateOnly(now))) /
      DAY_IN_MILLISECONDS,
  )

  if (remainingDays < 0) return '期限切れ'
  if (remainingDays === 0) return '今日まで！'
  return `あと${remainingDays}日`
}

export function toTask(record: TaskRecord, index: number, now: Date): Task {
  return {
    id: record.id,
    index,
    title: record.title,
    subject: record.subjectName,
    courseId: record.courseId,
    dueDate: formatDueDate(record.dueDate),
    warning: formatDueWarning(record.dueDate, now),
    answerStatus: record.status === 'submitted' ? 'submitted' : 'unreviewed',
    formUrls: [...record.formUrls],
  }
}

export function useTasks(options: UseTasksOptions = {}): UseTasksResult {
  const status = ref<TaskListStatus>('loading')
  const tasks = ref<Task[]>([])
  const error = ref<unknown>(null)
  const repository = options.repository ?? defaultTaskRepository
  const sync =
    options.sync ?? options.syncClassroomCourses ?? defaultSyncClassroomCourses
  const now = options.now ?? (() => new Date())
  let requestId = 0
  let disposed = false
  let requestRunning = false
  let pendingReloads: Array<() => void> = []

  const execute = async (currentRequestId: number): Promise<void> => {
    try {
      await sync({
        repository: repository as TaskRepository,
        fetchImplementation: options.fetchImplementation,
        now,
      })
      const records = await repository.getUnsubmittedTasks()

      if (disposed || currentRequestId !== requestId) return

      const currentDate = now()
      tasks.value = records.map((record, index) =>
        toTask(record, index + 1, currentDate),
      )
      status.value = tasks.value.length > 0 ? 'ready' : 'empty'
    } catch (caughtError) {
      if (disposed || currentRequestId !== requestId) return

      tasks.value = []
      error.value = caughtError
      status.value = 'error'
    }
  }

  const pumpReloads = (): void => {
    if (requestRunning || disposed || pendingReloads.length === 0) return

    // Several clicks while one request is active only need one follow-up
    // synchronization. Every caller still receives completion notification.
    const waiters = pendingReloads
    pendingReloads = []
    const currentRequestId = requestId
    requestRunning = true

    void execute(currentRequestId).finally(() => {
      requestRunning = false
      waiters.forEach((resolve) => resolve())
      pumpReloads()
    })
  }

  const reload = (): Promise<void> => {
    if (disposed) return Promise.resolve()

    ++requestId
    status.value = 'loading'
    // Never show a stale list while a new sync is in progress.
    tasks.value = []
    error.value = null

    const promise = new Promise<void>((resolve) => {
      pendingReloads.push(resolve)
    })
    pumpReloads()
    return promise
  }

  const updateTaskAnswerStatus = (
    taskId: string,
    answerStatus: AnswerStatus,
  ): void => {
    tasks.value = tasks.value.map((task) =>
      task.id === taskId ? { ...task, answerStatus } : task,
    )
  }

  const courseId = computed(() => tasks.value[0]?.courseId ?? 'default')

  if (getCurrentInstance()) {
    onUnmounted(() => {
      disposed = true
      requestId += 1
      const waiters = pendingReloads
      pendingReloads = []
      waiters.forEach((resolve) => resolve())
    })
  }

  void reload()

  return {
    status,
    tasks,
    error,
    reload,
    retry: reload,
    updateTaskAnswerStatus,
    courseId,
  }
}

import {
  computed,
  getCurrentInstance,
  onUnmounted,
  ref,
  watch,
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
import {
  useProvidedTaskSyncContext,
  type TaskSyncContext,
} from './taskSyncContext'

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

type RepositoryLike =
  Pick<TaskRepository, 'getUnsubmittedTasks'> | TaskRepository

interface RepositoryQueueJob {
  run: () => Promise<void>
  shouldSkip: () => boolean
  resolve: () => void
}

interface RepositoryQueue {
  running: boolean
  pending: RepositoryQueueJob[]
}

// A Repository is the serialization boundary for the writes performed by a
// Classroom sync. Sharing this queue across composable instances also covers
// a page unmount/remount while an earlier sync is still in flight.
const repositoryQueues = new WeakMap<object, RepositoryQueue>()

function getRepositoryQueue(repository: RepositoryLike): RepositoryQueue {
  const key = repository as object
  const existingQueue = repositoryQueues.get(key)
  if (existingQueue) return existingQueue

  const queue: RepositoryQueue = { running: false, pending: [] }
  repositoryQueues.set(key, queue)
  return queue
}

function pumpRepositoryQueue(queue: RepositoryQueue): void {
  if (queue.running) return

  while (queue.pending.length > 0) {
    const job = queue.pending.shift()!
    if (job.shouldSkip()) {
      job.resolve()
      continue
    }

    queue.running = true
    let execution: Promise<void>
    try {
      execution = job.run()
    } catch {
      execution = Promise.resolve()
    }

    // The composable handles expected failures in execute. Keep this queue
    // alive even if an injected implementation unexpectedly rejects.
    void execution
      .catch(() => undefined)
      .finally(() => {
        queue.running = false
        job.resolve()
        pumpRepositoryQueue(queue)
      })
    return
  }
}

function enqueueRepositoryJob(
  repository: RepositoryLike,
  run: () => Promise<void>,
  shouldSkip: () => boolean,
): Promise<void> {
  const queue = getRepositoryQueue(repository)
  return new Promise<void>((resolve) => {
    queue.pending.push({ run, shouldSkip, resolve })
    pumpRepositoryQueue(queue)
  })
}

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

function useTasksStandalone(options: UseTasksOptions = {}): UseTasksResult {
  const status = ref<TaskListStatus>('loading')
  const tasks = ref<Task[]>([])
  const error = ref<unknown>(null)
  const repository: RepositoryLike = options.repository ?? defaultTaskRepository
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

    void enqueueRepositoryJob(
      repository,
      () => execute(currentRequestId),
      () => disposed || currentRequestId !== requestId,
    ).finally(() => {
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

/**
 * Reads tasks from the sync owned by AppLayout. The standalone implementation
 * above intentionally remains available for unit tests and non-AppLayout
 * consumers that inject their own sync function.
 */
function useTasksFromContext(
  options: UseTasksOptions,
  syncContext: TaskSyncContext,
): UseTasksResult {
  const status = ref<TaskListStatus>('loading')
  const tasks = ref<Task[]>([])
  const error = ref<unknown>(null)
  const repository: RepositoryLike =
    options.repository ?? syncContext.repository ?? defaultTaskRepository
  const now = options.now ?? (() => new Date())
  let disposed = false
  let loadedRevision = -1
  let activeReadRevision = -1
  let activeRead: Promise<void> | undefined

  const readTasks = (revision: number): Promise<void> => {
    if (disposed || revision <= loadedRevision) return Promise.resolve()
    if (activeReadRevision === revision && activeRead) return activeRead

    activeReadRevision = revision
    status.value = 'loading'
    tasks.value = []
    error.value = null
    const read = repository
      .getUnsubmittedTasks()
      .then((records) => {
        if (disposed || revision !== syncContext.revision.value) return

        const currentDate = now()
        tasks.value = records.map((record, index) =>
          toTask(record, index + 1, currentDate),
        )
        loadedRevision = revision
        status.value = tasks.value.length > 0 ? 'ready' : 'empty'
      })
      .catch((caughtError) => {
        if (disposed || revision !== syncContext.revision.value) return

        tasks.value = []
        error.value = caughtError
        status.value = 'error'
      })

    const tracked = read.finally(() => {
      if (activeRead === tracked) {
        activeRead = undefined
        activeReadRevision = -1
      }
    })
    activeRead = tracked
    return tracked
  }

  const syncStateChanged = (): void => {
    if (disposed) return

    if (syncContext.status.value === 'error') {
      tasks.value = []
      error.value = syncContext.error.value
      status.value = 'error'
      return
    }

    if (syncContext.status.value === 'loading') {
      status.value = 'loading'
      tasks.value = []
      error.value = null
      return
    }

    if (syncContext.revision.value > 0) {
      void readTasks(syncContext.revision.value)
    }
  }

  const stop = watch(
    [syncContext.revision, syncContext.status],
    syncStateChanged,
    { immediate: true },
  )

  const reload = async (): Promise<void> => {
    if (disposed) return

    const previousRevision = syncContext.revision.value
    await syncContext.reload()
    if (disposed) return

    if (syncContext.status.value === 'error') {
      syncStateChanged()
      return
    }

    const revision = syncContext.revision.value
    if (revision > previousRevision || revision > 0) {
      await readTasks(revision)
    }
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
      stop()
    })
  }

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

export function useTasks(options: UseTasksOptions = {}): UseTasksResult {
  const providedContext = getCurrentInstance()
    ? useProvidedTaskSyncContext()
    : undefined

  // Explicit standalone injection options are primarily test support. In
  // production AppLayout's provided context owns the one Classroom sync.
  if (providedContext && !options.sync && !options.syncClassroomCourses) {
    return useTasksFromContext(options, providedContext)
  }

  return useTasksStandalone(options)
}

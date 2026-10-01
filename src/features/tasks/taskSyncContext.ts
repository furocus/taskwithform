import {
  getCurrentInstance,
  inject,
  onMounted,
  onUnmounted,
  provide,
  ref,
  type InjectionKey,
  type Ref,
} from 'vue'
import {
  taskRepository as defaultTaskRepository,
  type TaskRepository,
} from '../../database/task.repository'
import {
  syncClassroomCourses as defaultSyncClassroomCourses,
  type SyncClassroomCoursesOptions,
  type SyncClassroomCoursesResult,
} from './classroom.sync'

export type TaskSyncStatus = 'loading' | 'ready' | 'empty' | 'error'

export type TaskSyncImplementation = (
  options?: SyncClassroomCoursesOptions,
) => Promise<SyncClassroomCoursesResult | void>

export interface TaskSyncContextOptions {
  repository?: TaskRepository
  sync?: TaskSyncImplementation
  fetchImplementation?: SyncClassroomCoursesOptions['fetchImplementation']
  now?: () => Date
  /** Concurrent calls are one user action in the authenticated layout. */
  coalesceReloads?: boolean
}

export interface TaskSyncContext {
  /** Repository used by the sync and all authenticated consumers. */
  repository: TaskRepository
  status: Ref<TaskSyncStatus>
  /** Increments only after a successful Classroom sync. */
  revision: Ref<number>
  error: Ref<unknown>
  reload: () => Promise<void>
  /** Starts the initial synchronization once. */
  start: () => Promise<void>
  dispose: () => void
}

export const taskSyncContextKey: InjectionKey<TaskSyncContext> =
  Symbol('task-sync-context')

interface RepositoryQueueJob {
  run: () => Promise<void>
  shouldSkip: () => boolean
  resolve: () => void
}

interface RepositoryQueue {
  running: boolean
  pending: RepositoryQueueJob[]
}

// A sync writes a repository transaction. Keep the transaction boundary
// serialized even if an old page is still finishing while another consumer
// mounts, as useTasks historically did.
const repositoryQueues = new WeakMap<object, RepositoryQueue>()

function getRepositoryQueue(repository: object): RepositoryQueue {
  const existing = repositoryQueues.get(repository)
  if (existing) return existing

  const queue: RepositoryQueue = { running: false, pending: [] }
  repositoryQueues.set(repository, queue)
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
  repository: object,
  run: () => Promise<void>,
  shouldSkip: () => boolean,
): Promise<void> {
  const queue = getRepositoryQueue(repository)
  return new Promise<void>((resolve) => {
    queue.pending.push({ run, shouldSkip, resolve })
    pumpRepositoryQueue(queue)
  })
}

export function createTaskSyncContext(
  options: TaskSyncContextOptions = {},
): TaskSyncContext {
  const repository = options.repository ?? defaultTaskRepository
  const sync = options.sync ?? defaultSyncClassroomCourses
  const status = ref<TaskSyncStatus>('loading')
  const revision = ref(0)
  const error = ref<unknown>(null)
  let disposed = false
  let started = false
  let activeReload: Promise<void> | undefined

  const execute = async (): Promise<void> => {
    try {
      const result = await sync({
        repository,
        fetchImplementation: options.fetchImplementation,
        now: options.now,
      })

      if (disposed) return

      revision.value += 1
      error.value = null
      status.value = result?.syncedTaskCount === 0 ? 'empty' : 'ready'
    } catch (caughtError) {
      if (disposed) return

      error.value = caughtError
      status.value = 'error'
    }
  }

  const reload = (): Promise<void> => {
    if (disposed) return Promise.resolve()

    if (options.coalesceReloads !== false && activeReload) {
      return activeReload
    }

    status.value = 'loading'
    error.value = null
    const promise = enqueueRepositoryJob(repository, execute, () => disposed)
    const tracked = promise.finally(() => {
      if (activeReload === tracked) {
        activeReload = undefined
      }
    })
    activeReload = tracked
    return tracked
  }

  const start = (): Promise<void> => {
    if (started) return activeReload ?? Promise.resolve()
    started = true
    return reload()
  }

  const dispose = (): void => {
    disposed = true
    if (activeReload === undefined) return
    // The queued job checks disposed before it calls the sync implementation.
  }

  return {
    repository,
    status,
    revision,
    error,
    reload,
    start,
    dispose,
  }
}

export function provideTaskSyncContext(
  options: TaskSyncContextOptions = {},
): TaskSyncContext {
  const context = createTaskSyncContext(options)
  provide(taskSyncContextKey, context)

  if (getCurrentInstance()) {
    onMounted(() => {
      void context.start()
    })
    onUnmounted(context.dispose)
  }

  return context
}

export function useProvidedTaskSyncContext(): TaskSyncContext | undefined {
  return inject(taskSyncContextKey, undefined)
}

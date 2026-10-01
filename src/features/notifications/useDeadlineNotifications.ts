import {
  computed,
  getCurrentInstance,
  onUnmounted,
  ref,
  watch,
  type Ref,
} from 'vue'
import type { DateOnly, TaskRecord } from '../../database/database.types'
import {
  taskRepository as defaultTaskRepository,
  type TaskRepository,
} from '../../database/task.repository'
import { toDateOnly } from '../../shared/utils/date'
import {
  createTaskSyncContext,
  useProvidedTaskSyncContext,
  type TaskSyncContext,
  type TaskSyncImplementation,
} from '../tasks/taskSyncContext'
import type { SyncClassroomCoursesOptions } from '../tasks/classroom.sync'

export type DeadlineNotificationStatus = 'loading' | 'empty' | 'ready' | 'error'

export interface UseDeadlineNotificationsOptions {
  repository?: Pick<TaskRepository, 'getUnsubmittedTasksInDateRange'>
  now?: () => Date
  sync?: TaskSyncImplementation
  syncContext?: TaskSyncContext
  fetchImplementation?: SyncClassroomCoursesOptions['fetchImplementation']
}

export interface DeadlineNotificationsResult {
  status: Ref<DeadlineNotificationStatus>
  /** Repository ordering is retained as-is. */
  notifications: Ref<TaskRecord[]>
  /** Local date used by the most recent repository query. */
  date: Ref<DateOnly>
  error: Ref<unknown>
  count: Readonly<Ref<number>>
  badgeLabel: Readonly<Ref<string>>
  reload: () => Promise<void>
}

type NotificationRepository = Pick<
  TaskRepository,
  'getUnsubmittedTasksInDateRange'
>

function useDirectNotifications(
  repository: NotificationRepository,
  now: () => Date,
): DeadlineNotificationsResult {
  const status = ref<DeadlineNotificationStatus>('loading')
  const notifications = ref<TaskRecord[]>([])
  const date = ref<DateOnly>(toDateOnly(now()))
  const error = ref<unknown>(null)
  let disposed = false
  let requestId = 0

  const load = async (): Promise<void> => {
    const currentRequestId = ++requestId
    const today = toDateOnly(now())
    date.value = today
    status.value = 'loading'
    notifications.value = []
    error.value = null

    try {
      const records = await repository.getUnsubmittedTasksInDateRange(
        today,
        today,
      )
      if (disposed || currentRequestId !== requestId) return

      notifications.value = records
      status.value = records.length > 0 ? 'ready' : 'empty'
    } catch (caughtError) {
      if (disposed || currentRequestId !== requestId) return

      error.value = caughtError
      status.value = 'error'
    }
  }

  void load()

  const count = computed(() => notifications.value.length)
  const badgeLabel = computed(() => {
    if (count.value === 0) return ''
    return count.value >= 10 ? '9+' : String(count.value)
  })
  const result: DeadlineNotificationsResult = {
    status,
    notifications,
    date,
    error,
    count,
    badgeLabel,
    reload: load,
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      disposed = true
    })
  }

  return result
}

export function useDeadlineNotifications(
  options: UseDeadlineNotificationsOptions = {},
): DeadlineNotificationsResult {
  const now = options.now ?? (() => new Date())
  const injectedContext =
    options.syncContext ??
    (getCurrentInstance() ? useProvidedTaskSyncContext() : undefined)
  const repository: NotificationRepository =
    options.repository ?? injectedContext?.repository ?? defaultTaskRepository

  // A caller outside AppLayout can still opt into the same sync lifecycle by
  // injecting a sync implementation. Without one, read-only composable tests
  // query their supplied repository directly.
  const ownedContext =
    injectedContext === undefined && options.sync !== undefined
      ? createTaskSyncContext({
          repository: repository as TaskRepository,
          sync: options.sync,
          fetchImplementation: options.fetchImplementation,
          now,
          coalesceReloads: true,
        })
      : undefined
  const syncContext = injectedContext ?? ownedContext

  if (!syncContext) {
    return useDirectNotifications(repository, now)
  }

  const status = ref<DeadlineNotificationStatus>('loading')
  const notifications = ref<TaskRecord[]>([])
  const date = ref<DateOnly>(toDateOnly(now()))
  const error = ref<unknown>(null)
  let disposed = false
  let requestId = 0
  let activeKey = ''
  let activeLoad: Promise<void> | undefined

  const load = (): Promise<void> => {
    const today = toDateOnly(now())
    const revision = syncContext.revision.value
    const key = `${revision}:${today}`
    if (activeLoad && activeKey === key) return activeLoad

    const currentRequestId = ++requestId
    activeKey = key
    date.value = today
    status.value = 'loading'
    notifications.value = []
    error.value = null

    const execute = async (): Promise<void> => {
      if (syncContext.status.value === 'error') {
        if (disposed || currentRequestId !== requestId) return
        error.value = syncContext.error.value
        status.value = 'error'
        return
      }

      if (syncContext.status.value === 'loading' || revision === 0) return

      try {
        const records = await repository.getUnsubmittedTasksInDateRange(
          today,
          today,
        )
        if (
          disposed ||
          currentRequestId !== requestId ||
          syncContext.revision.value !== revision
        ) {
          return
        }

        notifications.value = records
        status.value = records.length > 0 ? 'ready' : 'empty'
      } catch (caughtError) {
        if (disposed || currentRequestId !== requestId) return

        error.value = caughtError
        status.value = 'error'
      }
    }

    const tracked = execute().finally(() => {
      if (activeLoad === tracked) {
        activeLoad = undefined
        activeKey = ''
      }
    })
    activeLoad = tracked
    return tracked
  }

  const handleSyncState = (): void => {
    if (disposed) return

    if (syncContext.status.value === 'error') {
      requestId += 1
      notifications.value = []
      error.value = syncContext.error.value
      status.value = 'error'
      return
    }

    if (syncContext.status.value === 'loading') {
      requestId += 1
      notifications.value = []
      error.value = null
      status.value = 'loading'
      return
    }

    void load()
  }

  const stopRevision = watch(syncContext.revision, () => void load())
  const stopStatus = watch(syncContext.status, handleSyncState)
  handleSyncState()
  if (ownedContext) {
    void ownedContext.start()
  }

  const reload = async (): Promise<void> => {
    if (disposed) return
    await syncContext.reload()
    if (disposed) return
    handleSyncState()
    if (syncContext.status.value !== 'error') {
      await load()
    }
  }

  const count = computed(() => notifications.value.length)
  const badgeLabel = computed(() => {
    if (count.value === 0) return ''
    return count.value >= 10 ? '9+' : String(count.value)
  })

  if (getCurrentInstance()) {
    onUnmounted(() => {
      disposed = true
      stopRevision()
      stopStatus()
      ownedContext?.dispose()
    })
  }

  return {
    status,
    notifications,
    date,
    error,
    count,
    badgeLabel,
    reload,
  }
}

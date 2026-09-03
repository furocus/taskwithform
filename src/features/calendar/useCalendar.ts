import { getCurrentInstance, onUnmounted, ref, watch, type Ref } from 'vue'
import {
  taskRepository as defaultTaskRepository,
  type TaskRepository,
} from '../../database/task.repository'
import { getMonthBounds } from './calendar.utils'
import {
  useProvidedTaskSyncContext,
  type TaskSyncContext,
} from '../tasks/taskSyncContext'

export type CalendarStatus = 'loading' | 'empty' | 'error' | 'ready'

export interface UseCalendarOptions {
  syncContext?: TaskSyncContext
}

type CalendarRepository = Pick<TaskRepository, 'getTasksGroupedByDueDate'>

function useCalendarWithoutSync(
  displayedMonth: Ref<Date>,
  repository: CalendarRepository,
) {
  const status = ref<CalendarStatus>('loading')
  const tasksByDate = ref<
    Awaited<ReturnType<CalendarRepository['getTasksGroupedByDueDate']>>
  >({})
  const error = ref<unknown>(null)
  let requestId = 0

  const load = async () => {
    const currentRequestId = ++requestId
    status.value = 'loading'
    tasksByDate.value = {}
    error.value = null

    try {
      const bounds = getMonthBounds(displayedMonth.value)
      const tasks = await repository.getTasksGroupedByDueDate(
        bounds.startDate,
        bounds.endDate,
      )

      if (currentRequestId !== requestId) return

      tasksByDate.value = tasks
      status.value = Object.keys(tasks).length > 0 ? 'ready' : 'empty'
    } catch (caughtError) {
      if (currentRequestId !== requestId) return

      error.value = caughtError
      status.value = 'error'
    }
  }

  const stop = watch(displayedMonth, load, { immediate: true })
  onUnmounted(stop)

  return { status, tasksByDate, error, reload: load }
}

export function useCalendar(
  displayedMonth: Ref<Date>,
  repository?: CalendarRepository,
  options: UseCalendarOptions = {},
) {
  const providedContext =
    options.syncContext ??
    (getCurrentInstance() ? useProvidedTaskSyncContext() : undefined)
  const resolvedRepository: CalendarRepository =
    repository ?? providedContext?.repository ?? defaultTaskRepository

  if (!providedContext) {
    return useCalendarWithoutSync(displayedMonth, resolvedRepository)
  }

  const status = ref<CalendarStatus>('loading')
  const tasksByDate = ref<
    Awaited<ReturnType<CalendarRepository['getTasksGroupedByDueDate']>>
  >({})
  const error = ref<unknown>(null)
  let requestId = 0
  let disposed = false
  let activeLoadKey = ''
  let activeLoad: Promise<void> | undefined

  const load = (): Promise<void> => {
    const bounds = getMonthBounds(displayedMonth.value)
    const revision = providedContext.revision.value
    const loadKey = `${revision}:${bounds.startDate}:${bounds.endDate}`
    if (activeLoad && activeLoadKey === loadKey) return activeLoad

    const currentRequestId = ++requestId
    activeLoadKey = loadKey
    status.value = 'loading'
    tasksByDate.value = {}
    error.value = null

    const execute = async (): Promise<void> => {
      if (providedContext.status.value === 'error') {
        if (disposed || currentRequestId !== requestId) return
        error.value = providedContext.error.value
        status.value = 'error'
        return
      }

      if (
        providedContext.status.value === 'loading' ||
        providedContext.revision.value === 0
      ) {
        return
      }

      try {
        const tasks = await resolvedRepository.getTasksGroupedByDueDate(
          bounds.startDate,
          bounds.endDate,
        )

        if (
          disposed ||
          currentRequestId !== requestId ||
          providedContext.revision.value !== revision
        ) {
          return
        }

        tasksByDate.value = tasks
        status.value = Object.keys(tasks).length > 0 ? 'ready' : 'empty'
      } catch (caughtError) {
        if (disposed || currentRequestId !== requestId) return

        error.value = caughtError
        status.value = 'error'
      }
    }

    const tracked = execute().finally(() => {
      if (activeLoad === tracked) {
        activeLoad = undefined
        activeLoadKey = ''
      }
    })
    activeLoad = tracked
    return tracked
  }

  const handleSyncState = (): void => {
    if (disposed) return

    if (providedContext.status.value === 'error') {
      requestId += 1
      tasksByDate.value = {}
      error.value = providedContext.error.value
      status.value = 'error'
      return
    }

    if (providedContext.status.value === 'loading') {
      requestId += 1
      tasksByDate.value = {}
      error.value = null
      status.value = 'loading'
      return
    }

    void load()
  }

  const stopMonth = watch(displayedMonth, () => void load(), {
    immediate: true,
  })
  const stopRevision = watch(providedContext.revision, () => void load())
  const stopStatus = watch(providedContext.status, handleSyncState)

  const reload = async (): Promise<void> => {
    if (disposed) return
    await providedContext.reload()
    if (disposed) return
    handleSyncState()
    if (providedContext.status.value !== 'error') {
      await load()
    }
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      disposed = true
      stopMonth()
      stopRevision()
      stopStatus()
    })
  }

  return { status, tasksByDate, error, reload }
}

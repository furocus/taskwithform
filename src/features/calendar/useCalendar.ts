import { onUnmounted, ref, watch, type Ref } from 'vue'
import type { TaskRecord } from '../../database/database.types'
import { TaskRepository } from '../../database/task.repository'
import { getMonthBounds } from './calendar.utils'

export type CalendarStatus = 'loading' | 'empty' | 'error' | 'ready'

export function useCalendar(
  displayedMonth: Ref<Date>,
  repository: Pick<
    TaskRepository,
    'getTasksGroupedByDueDate'
  > = new TaskRepository(),
) {
  const status = ref<CalendarStatus>('loading')
  const tasksByDate = ref<Record<string, TaskRecord[]>>({})
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

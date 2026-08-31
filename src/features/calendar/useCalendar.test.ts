import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useCalendar } from './useCalendar'

function createRepository() {
  return {
    getTasksGroupedByDueDate: vi.fn().mockResolvedValue({}),
  }
}

describe('useCalendar', () => {
  it('loads the displayed month and reloads after month changes', async () => {
    const displayedMonth = ref(new Date(2026, 11, 1))
    const repository = createRepository()
    const calendar = useCalendar(displayedMonth, repository)

    await Promise.resolve()
    expect(repository.getTasksGroupedByDueDate).toHaveBeenCalledWith(
      '2026-12-01',
      '2026-12-31',
    )
    expect(calendar.status.value).toBe('empty')

    displayedMonth.value = new Date(2027, 0, 1)
    await Promise.resolve()
    expect(repository.getTasksGroupedByDueDate).toHaveBeenLastCalledWith(
      '2027-01-01',
      '2027-01-31',
    )
  })

  it('does not keep previous tasks while loading a new month', async () => {
    let resolveRequest: ((value: Record<string, never>) => void) | undefined
    const repository = {
      getTasksGroupedByDueDate: vi
        .fn()
        .mockResolvedValueOnce({ '2026-08-10': [] })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveRequest = resolve
            }),
        ),
    }
    const displayedMonth = ref(new Date(2026, 7, 1))
    const calendar = useCalendar(displayedMonth, repository)
    await Promise.resolve()

    displayedMonth.value = new Date(2026, 8, 1)
    await nextTick()
    expect(calendar.tasksByDate.value).toEqual({})
    expect(calendar.status.value).toBe('loading')

    resolveRequest?.({})
    await Promise.resolve()
    expect(calendar.status.value).toBe('empty')
  })
})

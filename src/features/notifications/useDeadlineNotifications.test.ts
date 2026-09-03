import { describe, expect, it, vi } from 'vitest'
import type { TaskRecord } from '../../database/database.types'
import { useDeadlineNotifications } from './useDeadlineNotifications'

const NOW = () => new Date(2026, 7, 31, 12, 30)

function createTask(id: string, dueDate = '2026-08-31'): TaskRecord {
  return {
    id,
    externalKey: JSON.stringify(['google-classroom', 'course-1', id]),
    source: 'google-classroom',
    courseId: 'course-1',
    courseName: '数学I',
    courseWorkId: id,
    courseWorkType: 'ASSIGNMENT',
    subjectName: '数学I',
    title: `課題${id}`,
    formUrls: [],
    dueDate,
    status: 'unsubmitted',
  }
}

describe('useDeadlineNotifications', () => {
  it('queries the injected local day and keeps repository ordering', async () => {
    const ordered = [createTask('second'), createTask('first')]
    const repository = {
      getUnsubmittedTasksInDateRange: vi.fn().mockResolvedValue(ordered),
    }
    const result = useDeadlineNotifications({ repository, now: NOW })

    await vi.waitFor(() => expect(result.status.value).toBe('ready'))

    expect(repository.getUnsubmittedTasksInDateRange).toHaveBeenCalledWith(
      '2026-08-31',
      '2026-08-31',
    )
    expect(result.notifications.value).toEqual(ordered)
    expect(result.count.value).toBe(2)
    expect(result.badgeLabel.value).toBe('2')
  })

  it('does not invent a badge at zero and uses 9+ at ten', async () => {
    const repository = {
      getUnsubmittedTasksInDateRange: vi
        .fn()
        .mockResolvedValue(
          Array.from({ length: 10 }, (_, index) => createTask(String(index))),
        ),
    }
    const result = useDeadlineNotifications({ repository, now: NOW })
    await vi.waitFor(() => expect(result.status.value).toBe('ready'))
    expect(result.badgeLabel.value).toBe('9+')

    repository.getUnsubmittedTasksInDateRange.mockResolvedValueOnce([])
    await result.reload()
    expect(result.status.value).toBe('empty')
    expect(result.badgeLabel.value).toBe('')
  })

  it('exposes an error and retries the same repository read', async () => {
    const repository = {
      getUnsubmittedTasksInDateRange: vi
        .fn()
        .mockRejectedValueOnce(new Error('IndexedDB unavailable'))
        .mockResolvedValueOnce([createTask('retry')]),
    }
    const result = useDeadlineNotifications({ repository, now: NOW })

    await vi.waitFor(() => expect(result.status.value).toBe('error'))
    expect(result.error.value).toMatchObject({
      message: 'IndexedDB unavailable',
    })

    await result.reload()
    expect(result.status.value).toBe('ready')
    expect(result.notifications.value[0]?.id).toBe('retry')
  })

  it('uses the new local date for both a retry and its navigation date', async () => {
    let current = new Date(2026, 7, 31, 23, 59)
    const repository = {
      getUnsubmittedTasksInDateRange: vi
        .fn()
        .mockResolvedValueOnce([createTask('august')])
        .mockResolvedValueOnce([createTask('september', '2026-09-01')]),
    }
    const result = useDeadlineNotifications({
      repository,
      now: () => current,
    })
    await vi.waitFor(() => expect(result.status.value).toBe('ready'))
    expect(result.date.value).toBe('2026-08-31')

    current = new Date(2026, 8, 1, 0, 1)
    await result.reload()

    expect(repository.getUnsubmittedTasksInDateRange).toHaveBeenLastCalledWith(
      '2026-09-01',
      '2026-09-01',
    )
    expect(result.date.value).toBe('2026-09-01')
    expect(result.notifications.value[0]?.dueDate).toBe('2026-09-01')
  })
})

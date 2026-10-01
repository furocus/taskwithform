import { describe, expect, it, vi } from 'vitest'
import type { TaskRepository } from '../../database/task.repository'
import {
  createTaskSyncContext,
  type TaskSyncImplementation,
} from './taskSyncContext'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('task sync context', () => {
  it('coalesces concurrent retries and increments revision once', async () => {
    const completion = deferred<void>()
    const repository = {}
    const sync = vi.fn<TaskSyncImplementation>(() => completion.promise)
    const context = createTaskSyncContext({
      repository: repository as TaskRepository,
      sync,
    })

    const first = context.reload()
    const second = context.reload()

    expect(sync).toHaveBeenCalledOnce()
    expect(context.status.value).toBe('loading')
    expect(context.repository).toBe(repository)

    completion.resolve()
    await Promise.all([first, second])

    expect(context.status.value).toBe('ready')
    expect(context.revision.value).toBe(1)
  })

  it('serializes contexts sharing a repository so the later sync wins', async () => {
    const firstCompletion = deferred<void>()
    const secondCompletion = deferred<void>()
    const repository = {}
    let callCount = 0
    const sync = vi.fn<TaskSyncImplementation>(() => {
      callCount += 1
      return callCount === 1
        ? firstCompletion.promise
        : secondCompletion.promise
    })
    const firstContext = createTaskSyncContext({
      repository: repository as TaskRepository,
      sync,
      coalesceReloads: false,
    })
    const secondContext = createTaskSyncContext({
      repository: repository as TaskRepository,
      sync,
      coalesceReloads: false,
    })

    const first = firstContext.reload()
    const second = secondContext.reload()
    expect(sync).toHaveBeenCalledOnce()

    firstCompletion.resolve()
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(2))
    secondCompletion.resolve()
    await Promise.all([first, second])

    expect(firstContext.revision.value).toBe(1)
    expect(secondContext.revision.value).toBe(1)
    expect(secondContext.status.value).toBe('ready')
  })

  it('exposes errors and recovers on a later retry', async () => {
    const sync = vi
      .fn<TaskSyncImplementation>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ syncedCourseIds: [], syncedTaskCount: 0 })
    const context = createTaskSyncContext({
      repository: {} as TaskRepository,
      sync,
    })

    await context.reload()
    expect(context.status.value).toBe('error')
    expect(context.error.value).toMatchObject({ message: 'offline' })
    expect(context.revision.value).toBe(0)

    await context.reload()
    expect(context.status.value).toBe('empty')
    expect(context.error.value).toBeNull()
    expect(context.revision.value).toBe(1)
  })
})

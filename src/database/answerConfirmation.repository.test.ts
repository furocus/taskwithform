import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AnswerConfirmationRepository } from './answerConfirmation.repository'
import { createFormReferenceKey } from './database.types'
import { TaskWithFormDatabase } from './db'

function createDatabase(): TaskWithFormDatabase {
  return new TaskWithFormDatabase(`taskwithform-test-${crypto.randomUUID()}`)
}

describe('AnswerConfirmationRepository', () => {
  let database: TaskWithFormDatabase
  let repository: AnswerConfirmationRepository

  beforeEach(() => {
    database = createDatabase()
    repository = new AnswerConfirmationRepository(database)
  })

  afterEach(async () => {
    await database.delete()
  })

  it('creates one canonical key for each resolved Form reference', () => {
    expect(
      createFormReferenceKey({
        resolution: 'resolved',
        sourceUrl: 'https://forms.google.com/form-1',
        standardFormId: 'standard-id',
        publishedFormId: 'published-id',
      }),
    ).toBe('standard:standard-id')
    expect(() =>
      createFormReferenceKey({
        resolution: 'resolved',
        sourceUrl: 'https://forms.google.com/form-1',
      }),
    ).toThrow('Form ID')
    expect(() =>
      createFormReferenceKey({
        resolution: 'unresolved',
        sourceUrl: 'https://forms.google.com/form-1',
      }),
    ).toThrow('unresolved')
  })

  it('upserts one current record per task and canonical Form key', async () => {
    await repository.save({
      taskExternalKey: 'task-1',
      formReferenceKey: 'standard:form-1',
      status: 'needsReview',
      confirmedAt: '2026-09-08T00:00:00.000Z',
    })
    await repository.save({
      taskExternalKey: 'task-1',
      formReferenceKey: 'standard:form-1',
      status: 'submitted',
      confirmedAt: '2026-09-08T01:00:00.000Z',
    })

    await expect(
      repository.get('task-1', 'standard:form-1'),
    ).resolves.toMatchObject({ status: 'submitted' })
    await expect(repository.getByTaskExternalKey('task-1')).resolves.toHaveLength(
      1,
    )
  })

  it('separates standard and published Form ID namespaces', async () => {
    await repository.save({
      taskExternalKey: 'task-1',
      formReferenceKey: 'standard:same-id',
      status: 'submitted',
      confirmedAt: '2026-09-08T00:00:00.000Z',
    })
    await repository.save({
      taskExternalKey: 'task-1',
      formReferenceKey: 'published:same-id',
      status: 'needsReview',
      confirmedAt: '2026-09-08T00:00:00.000Z',
    })

    await expect(repository.getByTaskExternalKey('task-1')).resolves.toHaveLength(
      2,
    )
    await expect(repository.getByFormReferenceKey('published:same-id')).resolves.toMatchObject(
      [{ status: 'needsReview' }],
    )
  })

  it('rejects unresolved or non-canonical Form keys', async () => {
    await expect(
      repository.save({
        taskExternalKey: 'task-1',
        formReferenceKey: 'form-1',
        status: 'submitted',
        confirmedAt: '2026-09-08T00:00:00.000Z',
      }),
    ).rejects.toThrow('canonical')
  })
})

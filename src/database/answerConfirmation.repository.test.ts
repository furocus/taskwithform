import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AnswerConfirmationRepository } from './answerConfirmation.repository'
import type { TaskFormReference } from './database.types'
import { TaskWithFormDatabase } from './db'
import { createFormReferenceKey, parseFormReferenceKey } from './formReference'
import { createExternalKey } from './task.repository'

const TASK_KEY = createExternalKey('course-1', 'courseWork', 'work-1')
const OTHER_TASK_KEY = createExternalKey(
  'course-2',
  'announcement',
  'announcement-1',
)

const publishedForm: TaskFormReference = {
  resolution: 'resolved',
  sourceUrl: 'https://docs.google.com/forms/d/e/form-id/viewform',
  formId: 'form-id',
  formIdType: 'published',
  formUrl: 'https://docs.google.com/forms/d/e/form-id/viewform',
}

const standardForm: TaskFormReference = {
  resolution: 'resolved',
  sourceUrl: 'https://docs.google.com/forms/d/form-id/viewform',
  formId: 'form-id',
  formIdType: 'standard',
  formUrl: 'https://docs.google.com/forms/d/form-id/viewform',
}

describe('createFormReferenceKey', () => {
  it('keeps the two ID spaces apart even for the same ID string', () => {
    expect(createFormReferenceKey(standardForm)).toBe('standard:form-id')
    expect(createFormReferenceKey(publishedForm)).toBe('published:form-id')
    expect(createFormReferenceKey(standardForm)).not.toBe(
      createFormReferenceKey(publishedForm),
    )
  })

  it('round-trips through parseFormReferenceKey', () => {
    expect(
      parseFormReferenceKey(createFormReferenceKey(publishedForm)),
    ).toEqual({ formIdType: 'published', formId: 'form-id' })
  })

  it('refuses an unresolved reference, which has no Form identity', () => {
    expect(() =>
      createFormReferenceKey({
        resolution: 'unresolved',
        sourceUrl: 'https://forms.gle/short',
        reason: 'short_url_resolution_failed',
      }),
    ).toThrowError(/unresolved/i)
  })

  it.each(['', 'form-id', 'unknown:form-id', 'standard:'])(
    'rejects the malformed key %s',
    (formReferenceKey) => {
      expect(() => parseFormReferenceKey(formReferenceKey)).toThrowError(
        /Malformed/,
      )
    },
  )
})

describe('AnswerConfirmationRepository', () => {
  let database: TaskWithFormDatabase
  let repository: AnswerConfirmationRepository

  beforeEach(() => {
    database = new TaskWithFormDatabase(
      `taskwithform-test-${crypto.randomUUID()}`,
    )
    repository = new AnswerConfirmationRepository(database)
  })

  afterEach(async () => {
    await database.delete()
  })

  it('keeps one current row per distribution item and Form', async () => {
    const formReferenceKey =
      AnswerConfirmationRepository.createKey(publishedForm)

    await repository.upsert({
      taskExternalKey: TASK_KEY,
      formReferenceKey,
      status: 'needsReview',
      confirmedAt: '2026-09-06T01:00:00.000Z',
    })
    await repository.upsert({
      taskExternalKey: TASK_KEY,
      formReferenceKey,
      status: 'submitted',
      confirmedAt: '2026-09-06T02:00:00.000Z',
    })

    await expect(database.answerConfirmations.count()).resolves.toBe(1)
    await expect(repository.get(TASK_KEY, formReferenceKey)).resolves.toEqual({
      taskExternalKey: TASK_KEY,
      formReferenceKey,
      status: 'submitted',
      confirmedAt: '2026-09-06T02:00:00.000Z',
    })
  })

  it('returns undefined for a Form that was never confirmed', async () => {
    await expect(
      repository.get(TASK_KEY, 'published:never-checked'),
    ).resolves.toBeUndefined()
  })

  it('separates the two ID spaces of the same Form ID', async () => {
    await repository.upsert({
      taskExternalKey: TASK_KEY,
      formReferenceKey: AnswerConfirmationRepository.createKey(standardForm),
      status: 'unreviewable',
      confirmedAt: '2026-09-06T01:00:00.000Z',
    })
    await repository.upsert({
      taskExternalKey: TASK_KEY,
      formReferenceKey: AnswerConfirmationRepository.createKey(publishedForm),
      status: 'submitted',
      confirmedAt: '2026-09-06T01:00:00.000Z',
    })

    await expect(repository.getByTask(TASK_KEY)).resolves.toHaveLength(2)
  })

  it('looks a Form up in every item that distributed it', async () => {
    const formReferenceKey =
      AnswerConfirmationRepository.createKey(publishedForm)
    for (const taskExternalKey of [TASK_KEY, OTHER_TASK_KEY]) {
      await repository.upsert({
        taskExternalKey,
        formReferenceKey,
        status: 'submitted',
        confirmedAt: '2026-09-06T01:00:00.000Z',
      })
    }

    await expect(
      repository.getByFormReferenceKey(formReferenceKey),
    ).resolves.toHaveLength(2)
  })

  it('filters by confirmation status', async () => {
    await repository.upsert({
      taskExternalKey: TASK_KEY,
      formReferenceKey: 'published:a',
      status: 'submitted',
      confirmedAt: '2026-09-06T01:00:00.000Z',
    })
    await repository.upsert({
      taskExternalKey: TASK_KEY,
      formReferenceKey: 'published:b',
      status: 'unreviewable',
      confirmedAt: '2026-09-06T01:00:00.000Z',
    })

    await expect(
      repository.listByStatus('unreviewable'),
    ).resolves.toMatchObject([{ formReferenceKey: 'published:b' }])
  })

  it('deletes one row and clears every row', async () => {
    await repository.upsert({
      taskExternalKey: TASK_KEY,
      formReferenceKey: 'published:a',
      status: 'submitted',
      confirmedAt: '2026-09-06T01:00:00.000Z',
    })
    await repository.upsert({
      taskExternalKey: OTHER_TASK_KEY,
      formReferenceKey: 'published:a',
      status: 'submitted',
      confirmedAt: '2026-09-06T01:00:00.000Z',
    })

    await repository.delete(TASK_KEY, 'published:a')
    await expect(
      repository.getByFormReferenceKey('published:a'),
    ).resolves.toMatchObject([{ taskExternalKey: OTHER_TASK_KEY }])

    await repository.clearAll()
    await expect(database.answerConfirmations.count()).resolves.toBe(0)
  })
})

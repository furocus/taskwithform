import 'fake-indexeddb/auto'

import Dexie, { type Table } from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { TaskRecordInput } from './database.types'
import { TaskWithFormDatabase } from './db'
import { createExternalKey, TaskRepository } from './task.repository'

interface LegacyV2Task {
  id: string
  externalKey: string
  source: 'google-classroom'
  courseId: string
  courseName: string
  courseWorkId: string
  courseWorkType: 'ASSIGNMENT'
  subjectName: string
  title: string
  description?: string
  alternateLink?: string
  formUrls: string[]
  dueDate?: string
  status: 'unsubmitted' | 'submitted'
  submittedAt?: string
}

/** The exact schema that shipped before TaskWithFormDatabase version 3. */
class LegacyV2Database extends Dexie {
  tasks!: Table<LegacyV2Task, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      tasks:
        'id, &externalKey, courseId, subjectName, dueDate, status, [status+dueDate]',
      syncStates: 'courseId',
    })
    this.version(2).stores({
      tasks:
        'id, &externalKey, courseId, subjectName, dueDate, status, [status+dueDate]',
      syncStates: 'courseId',
      answerConfirmations: '++id, formUrl, status, confirmedAt',
    })
  }
}

describe('TaskWithFormDatabase schema migration', () => {
  let databaseName: string

  beforeEach(() => {
    databaseName = `taskwithform-migration-test-${crypto.randomUUID()}`
  })

  afterEach(async () => {
    await Dexie.delete(databaseName)
  })

  it('upgrades a real version 2 task without changing its identity or local state', async () => {
    const taskId = crypto.randomUUID()
    const standardUrl =
      'https://docs.google.com/forms/d/standard-id/viewform?usp=sharing'
    const publishedUrl = 'https://forms.google.com/d/e/published-id/viewform'
    const unresolvedUrl = 'https://forms.gle/legacy-short'
    const legacyDatabase = new LegacyV2Database(databaseName)
    await legacyDatabase.open()
    expect(legacyDatabase.verno).toBe(2)
    await legacyDatabase.tasks.add({
      id: taskId,
      externalKey: JSON.stringify(['google-classroom', 'course-1', 'work-1']),
      source: 'google-classroom',
      courseId: 'course-1',
      courseName: '数学I',
      courseWorkId: 'work-1',
      courseWorkType: 'ASSIGNMENT',
      subjectName: '数学',
      title: '一次方程式',
      description: '既存の説明',
      alternateLink: 'https://classroom.google.com/c/example',
      formUrls: [standardUrl, publishedUrl, unresolvedUrl],
      dueDate: '2026-09-08',
      status: 'submitted',
      submittedAt: '2026-09-06T01:02:03.000Z',
    })
    legacyDatabase.close()

    const upgradedDatabase = new TaskWithFormDatabase(databaseName)
    await upgradedDatabase.open()
    expect(upgradedDatabase.verno).toBe(5)

    await expect(upgradedDatabase.tasks.get(taskId)).resolves.toEqual({
      id: taskId,
      externalKey: createExternalKey('course-1', 'courseWork', 'work-1'),
      source: 'google-classroom',
      courseId: 'course-1',
      courseName: '数学I',
      courseWorkType: 'ASSIGNMENT',
      itemType: 'courseWork',
      itemId: 'work-1',
      creationTime: '1970-01-01T00:00:00.000Z',
      subjectName: '数学',
      title: '一次方程式',
      description: '既存の説明',
      alternateLink: 'https://classroom.google.com/c/example',
      // `courseWorkId` and `formUrls` are dropped: `itemId` and `forms` are
      // the single representation from version 5 on.
      forms: [
        {
          resolution: 'resolved',
          sourceUrl: 'https://docs.google.com/forms/d/standard-id/viewform',
          formId: 'standard-id',
          formIdType: 'standard',
          formUrl: 'https://docs.google.com/forms/d/standard-id/viewform',
        },
        {
          resolution: 'resolved',
          sourceUrl: 'https://forms.google.com/d/e/published-id/viewform',
          formId: 'published-id',
          formIdType: 'published',
          formUrl: 'https://forms.google.com/d/e/published-id/viewform',
        },
        {
          resolution: 'unresolved',
          sourceUrl: unresolvedUrl,
          reason: 'legacy_url_invalid',
        },
      ],
      dueDate: '2026-09-08',
      status: 'submitted',
      submittedAt: '2026-09-06T01:02:03.000Z',
    })
    upgradedDatabase.close()
  })

  it('replaces the ++id answer confirmation store without blocking the upgrade', async () => {
    const legacyDatabase = new LegacyV2Database(databaseName)
    await legacyDatabase.open()
    // A version 2 confirmation row cannot name its distribution item, so it
    // cannot be re-keyed and is intentionally discarded by the upgrade.
    await legacyDatabase
      .table('answerConfirmations')
      .add({ formUrl: 'https://docs.google.com/forms/d/old/viewform' })
    legacyDatabase.close()

    const upgradedDatabase = new TaskWithFormDatabase(databaseName)
    await upgradedDatabase.open()

    expect(upgradedDatabase.verno).toBe(5)
    await expect(upgradedDatabase.answerConfirmations.count()).resolves.toBe(0)

    await upgradedDatabase.answerConfirmations.put({
      taskExternalKey: createExternalKey('course-1', 'courseWork', 'work-1'),
      formReferenceKey: 'published:form-id',
      status: 'submitted',
      confirmedAt: '2026-09-06T02:00:00.000Z',
    })
    await upgradedDatabase.answerConfirmations.put({
      taskExternalKey: createExternalKey('course-1', 'courseWork', 'work-1'),
      formReferenceKey: 'published:form-id',
      status: 'needsReview',
      confirmedAt: '2026-09-06T03:00:00.000Z',
    })

    // The composite primary key keeps one current row per (item, Form).
    await expect(upgradedDatabase.answerConfirmations.count()).resolves.toBe(1)
    await expect(
      upgradedDatabase.answerConfirmations.get([
        createExternalKey('course-1', 'courseWork', 'work-1'),
        'published:form-id',
      ]),
    ).resolves.toMatchObject({ status: 'needsReview' })
    upgradedDatabase.close()
  })

  it('stores the same course and item ID under different item types without a key collision', async () => {
    const database = new TaskWithFormDatabase(databaseName)
    const repository = new TaskRepository(database)
    const common: Pick<
      TaskRecordInput,
      'courseId' | 'courseName' | 'subjectName' | 'status'
    > = {
      courseId: 'course-1',
      courseName: '数学I',
      subjectName: '数学',
      status: 'unsubmitted',
    }

    await repository.replaceCourseSnapshot({
      courseId: 'course-1',
      fetchedDate: '2026-09-06',
      tasks: [
        {
          ...common,
          itemType: 'courseWork',
          itemId: 'shared-id',
          creationTime: '2026-09-01T00:00:00Z',
          courseWorkType: 'ASSIGNMENT',
          title: '課題',
          forms: [],
        },
        {
          ...common,
          itemType: 'announcement',
          itemId: 'shared-id',
          creationTime: '2026-09-02T00:00:00Z',
          title: 'お知らせ',
          forms: [],
        },
      ],
    })

    const tasks = await repository.getAllTasks()
    expect(tasks).toHaveLength(2)
    expect(tasks.map((task) => task.externalKey).sort()).toEqual(
      [
        createExternalKey('course-1', 'announcement', 'shared-id'),
        createExternalKey('course-1', 'courseWork', 'shared-id'),
      ].sort(),
    )
    expect(new Set(tasks.map((task) => task.id)).size).toBe(2)
    database.close()
  })
})

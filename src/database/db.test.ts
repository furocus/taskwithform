import 'fake-indexeddb/auto'

import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'

import { TaskWithFormDatabase } from './db'

const databaseNames: string[] = []

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)))
})

describe('TaskWithFormDatabase migrations', () => {
  for (const oldVersion of [2, 3]) {
    it(`upgrades v${oldVersion} data without changing task identity`, async () => {
      const name = `taskwithform-migration-test-${oldVersion}-${crypto.randomUUID()}`
      databaseNames.push(name)

      const legacy = new Dexie(name)
      legacy.version(1).stores({
        tasks: 'id, &externalKey, courseId, subjectName, dueDate, status',
        syncStates: 'courseId',
      })
      legacy.version(2).stores({
        tasks: 'id, &externalKey, courseId, subjectName, dueDate, status',
        syncStates: 'courseId',
        answerConfirmations: '++id, formUrl, status, confirmedAt',
      })
      if (oldVersion === 3) {
        legacy.version(3).stores({
          tasks:
            'id, &externalKey, courseId, subjectName, dueDate, status, itemType, itemId, creationTime',
          syncStates: 'courseId',
          answerConfirmations: '++id, formUrl, status, confirmedAt',
        })
      }
      await legacy.open()
      const taskId = crypto.randomUUID()
      await legacy.table('tasks').put({
        id: taskId,
        externalKey: '["google-classroom","course-1","work-1"]',
        source: 'google-classroom',
        courseId: 'course-1',
        courseName: '数学I',
        courseWorkId: 'work-1',
        courseWorkType: 'ASSIGNMENT',
        subjectName: '数学I',
        title: '確認テスト',
        formUrls: ['https://docs.google.com/forms/d/form-1/viewform'],
        status: 'unsubmitted',
      })
      await legacy.table('answerConfirmations').put({
        formUrl: 'https://docs.google.com/forms/d/form-1/viewform',
        status: 'submitted',
        confirmedAt: '2026-09-08T00:00:00.000Z',
      })
      legacy.close()

      const database = new TaskWithFormDatabase(name)
      await database.open()

      await expect(database.tasks.get(taskId)).resolves.toMatchObject({
        id: taskId,
        itemType: 'courseWork',
        itemId: 'work-1',
        externalKey: '["google-classroom","course-1","courseWork","work-1"]',
      })
      await expect(database.answerConfirmations.count()).resolves.toBe(0)
      expect(database.tables.map((table) => table.name)).not.toContain(
        'answerConfirmations',
      )
      database.close()
    })
  }
})

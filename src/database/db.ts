import Dexie, { type Table } from 'dexie'

import type {
  AnswerConfirmationRecord,
  SyncState,
  TaskRecord,
} from './database.types'

export const DATABASE_NAME = 'taskwithform'

export class TaskWithFormDatabase extends Dexie {
  tasks!: Table<TaskRecord, string>
  syncStates!: Table<SyncState, string>
  get answerConfirmations(): Table<AnswerConfirmationRecord, [string, string]> {
    return this.table('answerConfirmationsV5')
  }

  constructor(name = DATABASE_NAME) {
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

    this.version(3).stores({
      tasks:
        'id, &externalKey, courseId, subjectName, dueDate, status, [status+dueDate], itemType, itemId, creationTime',
      syncStates: 'courseId',
      answerConfirmations: '++id, formUrl, status, confirmedAt',
    })

    this.version(4).stores({
      tasks:
        'id, &externalKey, courseId, subjectName, dueDate, status, [status+dueDate], itemType, itemId, creationTime',
      syncStates: 'courseId',
      answerConfirmations: '++id, formUrl, status, confirmedAt',
    })

    this.version(5)
      .stores({
        tasks:
          'id, &externalKey, courseId, subjectName, dueDate, status, [status+dueDate], itemType, itemId, creationTime',

        syncStates: 'courseId',

        answerConfirmations: null,

        answerConfirmationsV5:
          '&[taskExternalKey+formReferenceKey], taskExternalKey, formReferenceKey, status, confirmedAt',
      })
      .upgrade(async (transaction) => {
        const tasks = transaction.table('tasks')

        await tasks.toCollection().modify((task) => {
          // version(2)からの移行
          if (task.itemType === undefined) {
            task.itemType = 'courseWork'
          }

          if (task.itemId === undefined) {
            task.itemId = task.courseWorkId
          }

          if (task.creationTime === undefined) {
            /*
             * version(2)にはcreationTimeが存在しないため、
             * 値を捏造しない。
             *
             * 次回Classroom同期で正式なcreationTimeが入る。
             */
            task.creationTime = new Date(0).toISOString()
          }

          if (task.forms === undefined) {
            const formUrls = Array.isArray(task.formUrls) ? task.formUrls : []

            task.forms = formUrls.map((sourceUrl: string) => ({
              resolution: 'unresolved',
              sourceUrl,
            }))
          }

          delete task.courseWorkId
          delete task.formUrls
        })

        await tasks.toCollection().modify((task) => {
          task.externalKey = JSON.stringify([
            'google-classroom',
            task.courseId,
            task.itemType,
            task.itemId,
          ])
        })
      })
  }
}

export const database = new TaskWithFormDatabase()

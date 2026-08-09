import Dexie, { type Table } from 'dexie'

import type { SyncState, TaskRecord } from './database.types'

export const DATABASE_NAME = 'taskwithform'

export class TaskWithFormDatabase extends Dexie {
  tasks!: Table<TaskRecord, string>
  syncStates!: Table<SyncState, string>

  constructor(name = DATABASE_NAME) {
    super(name)

    this.version(1).stores({
      tasks:
        'id, &externalKey, courseId, subjectName, dueDate, status, [status+dueDate]',
      syncStates: 'courseId',
    })
    this.version(2).stores({
      tasks:
        'id, &externalKey, source, courseId, courseName, courseWorkId, subjectName, dueDate, status, [status+dueDate], submittedAt',
        syncStates: 'courseId',
        answerConfirmations: '++id, formUrl, status, submittedAt'
    })
  }
}

export const database = new TaskWithFormDatabase()

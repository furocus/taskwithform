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
  }
}

export const database = new TaskWithFormDatabase()

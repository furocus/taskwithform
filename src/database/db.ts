import Dexie, { type Table } from 'dexie'

import type {
  AnswerConfirmationRecord,
  SyncState,
  TaskRecord,
} from './database.types'

export const DATABASE_NAME = 'taskwithform'

function migrateLegacyForm(formUrl: string) {
  try {
    const parsed = new URL(formUrl)
    const segments = parsed.pathname.split('/').filter(Boolean)
    const formsIndex = segments.indexOf('forms')
    let formId
    let action
    if (formsIndex >= 0 && segments[formsIndex + 1] === 'd') {
      let idIndex = formsIndex + 2
      if (segments[idIndex] === 'e') idIndex += 1
      formId = segments[idIndex]
      action = segments[idIndex + 1]
    } else if (segments.length >= 2) {
      formId = segments.at(-2)
      action = segments.at(-1)
    }
    if (
      (parsed.hostname === 'docs.google.com' ||
        parsed.hostname === 'forms.google.com') &&
      typeof formId === 'string' &&
      /^[A-Za-z0-9_-]+$/.test(formId) &&
      (action === 'viewform' || action === 'edit')
    ) {
      const sourceUrl = `${parsed.origin}${parsed.pathname}`
      return {
        resolution: 'resolved',
        sourceUrl,
        formId,
        formUrl: sourceUrl,
      }
    }
  } catch {
    // Keep malformed legacy URLs as unresolved candidates. The next Classroom
    // sync will replace them with a validated reference or remove them.
  }
  return { resolution: 'unresolved', sourceUrl: formUrl }
}

export class TaskWithFormDatabase extends Dexie {
  tasks!: Table<TaskRecord, string>
  syncStates!: Table<SyncState, string>
  answerConfirmations!: Table<AnswerConfirmationRecord, number>

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
    this.version(3)
      .stores({
        tasks:
          'id, &externalKey, courseId, itemType, itemId, creationTime, subjectName, dueDate, status, [status+creationTime]',
        syncStates: 'courseId',
        answerConfirmations: '++id, formUrl, status, confirmedAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table('tasks')
          .toCollection()
          .modify((task: Record<string, unknown>) => {
            const itemType = task.itemType ?? 'courseWork'
            const itemId = task.itemId ?? task.courseWorkId
            if (typeof itemId !== 'string' || itemId === '') return

            task.itemType = itemType
            task.itemId = itemId
            task.creationTime =
              typeof task.creationTime === 'string' && task.creationTime !== ''
                ? task.creationTime
                : '1970-01-01T00:00:00.000Z'
            const legacyUrls: string[] = Array.isArray(task.formUrls)
              ? task.formUrls.filter(
                  (value): value is string => typeof value === 'string',
                )
              : []
            task.forms = Array.isArray(task.forms)
              ? task.forms
              : legacyUrls.map(migrateLegacyForm)
            task.formUrls = legacyUrls
            task.externalKey = JSON.stringify([
              'google-classroom',
              task.courseId,
              itemType,
              itemId,
            ])
          })
      })
  }
}

export const database = new TaskWithFormDatabase()

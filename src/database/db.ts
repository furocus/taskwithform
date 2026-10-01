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
    const allowedPathPrefix =
      parsed.hostname === 'docs.google.com' ? '/forms' : '(?:/forms)?'
    const standardMatch = new RegExp(
      `^${allowedPathPrefix}/d/([^/]+)/(edit|viewform)$`,
    ).exec(parsed.pathname)
    const publishedMatch = new RegExp(
      `^${allowedPathPrefix}/d/e/([^/]+)/viewform$`,
    ).exec(parsed.pathname)
    const matched = publishedMatch ?? standardMatch
    const formId = matched?.[1]
    if (
      parsed.protocol === 'https:' &&
      parsed.port === '' &&
      parsed.username === '' &&
      parsed.password === '' &&
      (parsed.hostname === 'docs.google.com' ||
        parsed.hostname === 'forms.google.com') &&
      typeof formId === 'string' &&
      /^[A-Za-z0-9_-]+$/.test(formId) &&
      formId !== 'e'
    ) {
      const sourceUrl = `${parsed.origin}${parsed.pathname}`
      return {
        resolution: 'resolved',
        sourceUrl,
        formId,
        formIdType: publishedMatch === null ? 'standard' : 'published',
        formUrl: sourceUrl,
      }
    }
  } catch {
    // Keep malformed legacy URLs as unresolved candidates. The next Classroom
    // sync will replace them with a validated reference or remove them.
  }
  return {
    resolution: 'unresolved',
    sourceUrl: formUrl,
    reason: 'legacy_url_invalid',
  }
}

export class TaskWithFormDatabase extends Dexie {
  tasks!: Table<TaskRecord, string>
  syncStates!: Table<SyncState, string>
  answerConfirmations!: Table<AnswerConfirmationRecord, [string, string]>

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

    /*
     * Dexie cannot change the primary key of an existing object store, so the
     * ++id `answerConfirmations` store is dropped here and recreated with the
     * composite key in version(5). Stored confirmations are discarded: the old
     * rows are keyed by `formUrl` alone and carry no distribution item, so the
     * `[taskExternalKey+formReferenceKey]` identity cannot be reconstructed.
     * Nothing is lost permanently - re-running a Form check restores it.
     */
    this.version(4).stores({
      tasks:
        'id, &externalKey, courseId, itemType, itemId, creationTime, subjectName, dueDate, status, [status+creationTime]',
      syncStates: 'courseId',
      answerConfirmations: null,
    })

    this.version(5)
      .stores({
        tasks:
          'id, &externalKey, courseId, itemType, itemId, creationTime, subjectName, dueDate, status, [status+creationTime]',
        syncStates: 'courseId',
        // Indexes for the queries that exist: newest first per item, reverse
        // lookup from a Form, and filtering by confirmation state.
        answerConfirmations:
          '&[taskExternalKey+formReferenceKey], taskExternalKey, formReferenceKey, status, confirmedAt',
      })
      .upgrade(async (transaction) => {
        // The v3 shape kept `courseWorkId` and `formUrls` alongside the new
        // fields. `forms` and `itemId` are authoritative from here on, so the
        // duplicated representations are removed instead of drifting apart.
        await transaction
          .table('tasks')
          .toCollection()
          .modify((task: Record<string, unknown>) => {
            delete task.courseWorkId
            delete task.formUrls
          })
      })
  }
}

export const database = new TaskWithFormDatabase()

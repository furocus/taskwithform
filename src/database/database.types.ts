/** A calendar date serialized as YYYY-MM-DD for IndexedDB ordering. */
export type DateOnly = string

/** An absolute timestamp serialized as an ISO 8601 string. */
export type IsoDateTime = string

export type TaskStatus = 'unsubmitted' | 'submitted' | 'untracked'

export type ClassroomCourseWorkType =
  'ASSIGNMENT' | 'SHORT_ANSWER_QUESTION' | 'MULTIPLE_CHOICE_QUESTION'

export type ClassroomItemType =
  'courseWork' | 'courseWorkMaterial' | 'announcement'

export type TaskFormReference =
  | {
      resolution: 'resolved'
      sourceUrl: string
      formId: string
      formIdType: 'standard' | 'published'
      formUrl: string
    }
  | {
      resolution: 'unresolved'
      sourceUrl: string
      reason: 'short_url_resolution_failed' | 'legacy_url_invalid'
    }

export interface TaskRecord {
  id: string
  externalKey: string
  source: 'google-classroom'

  courseId: string
  courseName: string

  /** What Classroom distributed: course work, material or announcement. */
  itemType: ClassroomItemType
  /** The Classroom ID of the distribution item itself. */
  itemId: string
  creationTime: IsoDateTime
  /**
   * Only course work has a Classroom work type. This is not a duplicate of any
   * other field, so it stays while `courseWorkId` and `formUrls` are gone.
   */
  courseWorkType?: ClassroomCourseWorkType

  subjectName: string
  title: string
  description?: string
  alternateLink?: string
  /** Every Form this item distributes. URLs live here and nowhere else. */
  forms: TaskFormReference[]

  dueDate?: DateOnly
  status: TaskStatus
  submittedAt?: IsoDateTime
}

export interface SyncState {
  courseId: string
  fetchedDate: DateOnly
}

/** The repository owns `id`, `externalKey` and `source`; callers own the rest. */
export type TaskRecordInput = Omit<TaskRecord, 'id' | 'externalKey' | 'source'>

export interface CourseTaskSnapshot {
  courseId: string
  fetchedDate: DateOnly
  tasks: readonly TaskRecordInput[]
}

/**
 * The Gmail answer confirmation state. Deliberately separate from
 * `TaskStatus`: a Classroom submission and a Form answer receipt are different
 * facts, and only the backend's three values are stored.
 */
export type AnswerConfirmationStatus =
  'submitted' | 'needsReview' | 'unreviewable'

/**
 * The current confirmation state of one Form inside one distribution item.
 *
 * `[taskExternalKey+formReferenceKey]` is the primary key, so re-checking the
 * same Form replaces the row instead of appending a history entry. The key is
 * built by `createFormReferenceKey()`; unresolved Form references have no key
 * and cannot be stored.
 */
export interface AnswerConfirmationRecord {
  taskExternalKey: string
  formReferenceKey: string
  status: AnswerConfirmationStatus
  confirmedAt: IsoDateTime
}

export type AnswerConfirmationInput = AnswerConfirmationRecord

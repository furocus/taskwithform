/** A calendar date serialized as YYYY-MM-DD for IndexedDB ordering. */
export type DateOnly = string

/** An absolute timestamp serialized as an ISO 8601 string. */
export type IsoDateTime = string

export type TaskStatus = 'unsubmitted' | 'submitted' | 'untracked'

/**
 * Classroom上での配布項目の種別。
 *
 * courseWork: 課題
 * courseWorkMaterial: 資料
 * announcement: お知らせ
 */
export type TaskItemType = 'courseWork' | 'courseWorkMaterial' | 'announcement'

export type ClassroomCourseWorkType =
  'ASSIGNMENT' | 'SHORT_ANSWER_QUESTION' | 'MULTIPLE_CHOICE_QUESTION'

/**
 * Formの参照情報。
 *
 * resolved:
 *   Formを識別できている。
 *
 * unresolved:
 *   URLは保持しているが、Form IDを解決できていない。
 */
export type TaskFormReference =
  ResolvedTaskFormReference | UnresolvedTaskFormReference

export interface ResolvedTaskFormReference {
  resolution: 'resolved'
  sourceUrl: string

  /**
   * Google Formsのstandard Form ID。
   * publishedFormIdとは別のID空間として扱う。
   */
  standardFormId?: string

  /**
   * Google Formsのpublished Form ID。
   * standardFormIdとは別のID空間として扱う。
   */
  publishedFormId?: string
}

export interface UnresolvedTaskFormReference {
  resolution: 'unresolved'
  sourceUrl: string
}

export type FormReferenceKey = `standard:${string}` | `published:${string}`

/** Returns the stable key used by answer-confirmation records. */
export function createFormReferenceKey(
  reference: TaskFormReference,
): FormReferenceKey {
  if (reference.resolution !== 'resolved') {
    throw new Error('An unresolved Form reference cannot be confirmed.')
  }

  if (
    reference.standardFormId !== undefined &&
    reference.standardFormId !== ''
  ) {
    return `standard:${reference.standardFormId}`
  }

  if (
    reference.publishedFormId !== undefined &&
    reference.publishedFormId !== ''
  ) {
    return `published:${reference.publishedFormId}`
  }

  throw new Error('A resolved Form reference must have a Form ID.')
}

export function isFormReferenceKey(value: string): value is FormReferenceKey {
  return /^(standard|published):.+$/.test(value)
}

export interface TaskRecord {
  id: string
  externalKey: string
  source: 'google-classroom'

  courseId: string
  courseName: string

  /** Classroom上の配布種別 */
  itemType: TaskItemType

  /** 配布項目そのもののID */
  itemId: string

  /** 配布項目の作成日時 */
  creationTime: IsoDateTime

  subjectName: string
  title: string
  description?: string
  alternateLink?: string

  /** この配布項目に含まれるForm */
  forms: TaskFormReference[]

  dueDate?: DateOnly
  status: TaskStatus
  submittedAt?: IsoDateTime
}

export interface SyncState {
  courseId: string
  fetchedDate: DateOnly
}

export type TaskRecordInput = Omit<TaskRecord, 'id' | 'externalKey' | 'source'>

export interface CourseTaskSnapshot {
  courseId: string
  fetchedDate: DateOnly
  tasks: readonly TaskRecordInput[]
}

/**
 * Form回答確認専用の状態。
 *
 * TaskStatusとは別概念として扱う。
 */
export type AnswerConfirmationStatus =
  'submitted' | 'unreviewable' | 'needsReview'

/**
 * 「配布項目 × Form参照」の現在の回答確認状態。
 *
 * Dexieでは
 * [taskExternalKey+formReferenceKey]
 * を主キーとして使用する。
 */
export interface AnswerConfirmationRecord {
  taskExternalKey: string
  formReferenceKey: string
  status: AnswerConfirmationStatus
  confirmedAt: IsoDateTime
}

export type AnswerConfirmationInput = AnswerConfirmationRecord

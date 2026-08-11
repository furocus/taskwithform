/** A calendar date serialized as YYYY-MM-DD for IndexedDB ordering. */
export type DateOnly = string

/** An absolute timestamp serialized as an ISO 8601 string. */
export type IsoDateTime = string

export type TaskStatus = 'unsubmitted' | 'submitted' | 'untracked'

export type ClassroomCourseWorkType =
  'ASSIGNMENT' | 'SHORT_ANSWER_QUESTION' | 'MULTIPLE_CHOICE_QUESTION'

export interface TaskRecord {
  id: string
  externalKey: string
  source: 'google-classroom'

  courseId: string
  courseName: string
  courseWorkId: string
  courseWorkType: ClassroomCourseWorkType

  subjectName: string
  title: string
  description?: string
  alternateLink?: string
  formUrls: string[]

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

export type AnswerConfirmationRecord = {
  id?: number
  formUrl: string //課題個別のFormURL
  status: TaskStatus
  confirmedAt?: IsoDateTime //YYYY-MM-DD式の確認日時（省略可能）
}

export type AnswerConfirmationInput = Omit<AnswerConfirmationRecord, 'id'>
/**AnswerConfirmationRecordからidのみを除外し、保存用に新しく型定義 */

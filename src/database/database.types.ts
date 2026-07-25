export type DateOnly = string

export type IsoDateTime = string

export type TaskStatus = 'unsubmitted' | 'submitted'

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

export type TaskRecordInput = Omit<TaskRecord, 'id' | 'externalKey'>

export interface CourseTaskSnapshot {
  courseId: string
  fetchedDate: DateOnly
  tasks: readonly TaskRecordInput[]
}

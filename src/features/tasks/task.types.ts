export type AnswerStatus =
  'unreviewed' | 'reviewing' | 'submitted' | 'unreviewable' | 'needsReview'

export interface Task {
  /** IndexedDB UUID. Keep this as a string all the way through the UI. */
  id: string
  index: number
  title: string
  subject: string
  courseId?: string
  dueDate: string
  warning: string
  answerStatus: AnswerStatus
  formUrls?: string[]
}

export type AnswerStatus =
  'unreviewed' | 'reviewing' | 'submitted' | 'unreviewable' | 'needsReview'

export interface Task {
  id: number
  index: number
  title: string
  subject: string
  courseId?: string
  dueDate: string
  warning: string
  answerStatus?: AnswerStatus
}

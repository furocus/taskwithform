export type AnswerStatus =
  'unreviewed' | 'reviewing' | 'submitted' | 'unreviewable' | 'needsReview'

export interface Task {
  /** IndexedDB UUID. Keep this as a string all the way through the UI. */
  id: string
  index: number
  title: string
  /** The distribution title, retained separately when a Form title exists. */
  distributionTitle?: string
  formTitle?: string
  sourceLabel?: string
  subject: string
  courseId?: string
  itemType?: 'courseWork' | 'courseWorkMaterial' | 'announcement'
  itemId?: string
  creationTime?: string
  dueDate: string
  warning: string
  answerStatus: AnswerStatus
  formUrls?: string[]
  form?: {
    resolution: 'resolved' | 'unresolved'
    sourceUrl: string
    formId?: string
    formUrl?: string
    title?: string
  }
}

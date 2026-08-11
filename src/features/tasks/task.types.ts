export interface Task {
  id: number
  index: number
  title: string
  subject: string
  courseId?: string
  dueDate: string
  warning: string
}

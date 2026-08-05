import type { Task } from '../features/tasks/task.types'

export const mockTasks: Task[] = [
  {
    id: 1,
    index: 1,
    title: 'デジタル社会と日本の未来　レポート作成',
    subject: 'デジタル社会と日本の未来',
    courseId: 'course-c',
    dueDate: '7月24日',
    warning: '今日まで！',
  },
  {
    id: 2,
    index: 2,
    title: 'アルゴリズム　課題２５',
    subject: 'アルゴリズム',
    courseId: 'course-algo',
    dueDate: '7月26日',
    warning: 'あと3日',
  },
  {
    id: 3,
    index: 3,
    title: 'ICT概論　７月の課題',
    subject: 'ICT概論',
    courseId: 'course-ict',
    dueDate: '7月28日',
    warning: 'あと5日',
  },
]

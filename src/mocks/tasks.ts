import type { Task } from '../features/tasks/task.types'

export const mockTasks: Task[] = [
  {
    id: 'mock-task-1',
    index: 1,
    title: 'レポート作成',
    subject: 'デジタル社会と日本の未来',
    courseId: 'course-c',
    dueDate: '7月24日',
    warning: '今日まで！',
    answerStatus: 'unreviewed',
    formUrls: [],
  },
  {
    id: 'mock-task-2',
    index: 2,
    title: '課題２５',
    subject: 'アルゴリズム',
    courseId: 'course-algo',
    dueDate: '7月26日',
    warning: 'あと3日',
    answerStatus: 'reviewing',
    formUrls: ['https://forms.google.com/needs-review-form'],
  },
  {
    id: 'mock-task-3',
    index: 3,
    title: '７月の課題',
    subject: 'ICT概論',
    courseId: 'course-ict',
    dueDate: '7月28日',
    warning: 'あと5日',
    answerStatus: 'submitted',
    formUrls: ['https://forms.google.com/answered-form'],
  },
]

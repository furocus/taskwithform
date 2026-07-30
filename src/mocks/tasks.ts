import type { Task } from '../features/tasks/task.types'

export const mockTasks: Task[] = [
  {
    id: 1,
    index: 1,
    title: 'C言語 練習問題 3問',
    subject: 'C言語',
    dueDate: '7月24日',
    warning: '今日まで！',
    accentColor: 'var(--color-tag-c-text)',
    badgeBg: 'var(--color-tag-c-bg)',
    badgeText: 'var(--color-tag-c-text)',
  },
  {
    id: 2,
    index: 2,
    title: 'アルゴリズムレポート',
    subject: 'アルゴリズム',
    dueDate: '7月26日',
    warning: 'あと3日',
    accentColor: 'var(--color-tag-algo-text)',
    badgeBg: 'var(--color-tag-algo-bg)',
    badgeText: 'var(--color-tag-algo-text)',
  },
  {
    id: 3,
    index: 3,
    title: 'ICT概論 発表原稿',
    subject: 'ICT概論',
    dueDate: '7月28日',
    warning: 'あと5日',
    accentColor: 'var(--color-tag-ict-text)',
    badgeBg: 'var(--color-tag-ict-bg)',
    badgeText: 'var(--color-tag-ict-text)',
  },
]

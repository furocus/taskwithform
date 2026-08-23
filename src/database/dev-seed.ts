import type { TaskRecordInput } from './database.types'
import { taskRepository } from './task.repository'

function toDateOnly(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateFromToday(offsetDays: number): string {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)
  return toDateOnly(date)
}

function createTask(overrides: Partial<TaskRecordInput> = {}): TaskRecordInput {
  return {
    courseId: 'seed-course-1',
    courseName: 'seedテスト1',
    courseWorkId: 'seed-work-1',
    subjectName: 'プログラミングI',
    title: 'seed: 1',
    formUrls: [],
    status: 'unsubmitted',
    ...overrides,
  } as TaskRecordInput
}

export async function seedLocalDatabase(): Promise<void> {
  if (!import.meta.env.DEV) {
    throw new Error('The database seed is available only in development.')
  }

  await taskRepository.clearLocalData()

  await taskRepository.replaceCourseSnapshot({
    courseId: 'seed-course-1',
    fetchedDate: dateFromToday(0),
    tasks: [
      createTask({
        courseWorkId: 'seed-work-due-today',
        title: 'seed: 今日が期限の課題',
        dueDate: dateFromToday(0),
        formUrls: ['https://docs.google.com/forms/d/seed-form-1/viewform'],
      }),
      createTask({
        courseWorkId: 'seed-work-due-later',
        title: 'seed: 3日後が期限の課題',
        dueDate: dateFromToday(3),
      }),
      createTask({
        courseWorkId: 'seed-work-no-due-date',
        title: 'seed: 期限なしの課題',
      }),
      createTask({
        courseWorkId: 'seed-work-submitted',
        title: 'seed: 提出済みの課題',
        dueDate: dateFromToday(-1),
        status: 'submitted',
        submittedAt: new Date().toISOString(),
      }),
    ],
  })

  await taskRepository.replaceCourseSnapshot({
    courseId: 'seed-course-2',
    fetchedDate: dateFromToday(0),
    tasks: [
      createTask({
        courseId: 'seed-course-2',
        courseName: 'seedテスト2',
        courseWorkId: 'seed-work-2',
        subjectName: 'デジタル社会と日本の未来',
        title: 'seed: 2',
        dueDate: dateFromToday(7),
      }),
    ],
  })
}

export async function clearSeededDatabase(): Promise<void> {
  if (!import.meta.env.DEV) {
    throw new Error('The database seed is available only in development.')
  }

  await taskRepository.clearLocalData()
}

import type {
  CourseTaskSnapshot,
  SyncState,
  TaskRecord,
  TaskRecordInput,
} from './database.types'
import { database as defaultDatabase, type TaskWithFormDatabase } from './db'

export function createExternalKey(
  courseId: string,
  courseWorkId: string,
): string {
  return JSON.stringify(['google-classroom', courseId, courseWorkId])
}

function toTaskRecord(
  input: TaskRecordInput,
  id: string,
  externalKey: string,
): TaskRecord {
  const record: TaskRecord = {
    id,
    externalKey,
    source: 'google-classroom',
    courseId: input.courseId,
    courseName: input.courseName,
    courseWorkId: input.courseWorkId,
    courseWorkType: input.courseWorkType,
    subjectName: input.subjectName,
    title: input.title,
    formUrls: [...input.formUrls],
    status: input.status,
  }

  if (input.description !== undefined) {
    record.description = input.description
  }

  if (input.alternateLink !== undefined) {
    record.alternateLink = input.alternateLink
  }

  if (input.dueDate !== undefined) {
    record.dueDate = input.dueDate
  }

  if (input.status === 'submitted' && input.submittedAt !== undefined) {
    record.submittedAt = input.submittedAt
  }

  return record
}

function compareTasksByDueDate(a: TaskRecord, b: TaskRecord): number {
  if (a.dueDate === undefined && b.dueDate === undefined) {
    return a.title.localeCompare(b.title, 'ja')
  }

  if (a.dueDate === undefined) {
    return 1
  }

  if (b.dueDate === undefined) {
    return -1
  }

  const dateOrder = a.dueDate.localeCompare(b.dueDate)
  return dateOrder === 0 ? a.title.localeCompare(b.title, 'ja') : dateOrder
}

export class TaskRepository {
  constructor(
    private readonly database: TaskWithFormDatabase = defaultDatabase,
  ) {}

  async replaceCourseSnapshot(snapshot: CourseTaskSnapshot): Promise<void> {
    await this.database.transaction(
      'rw',
      this.database.tasks,
      this.database.syncStates,
      async () => {
        const existingTasks = await this.database.tasks
          .where('courseId')
          .equals(snapshot.courseId)
          .toArray()
        const existingByExternalKey = new Map(
          existingTasks.map((task) => [task.externalKey, task]),
        )
        const incomingExternalKeys = new Set<string>()
        const incomingRecords: TaskRecord[] = []

        for (const input of snapshot.tasks) {
          if (input.courseId !== snapshot.courseId) {
            throw new Error(
              `Snapshot courseId "${snapshot.courseId}" does not match task courseId "${input.courseId}".`,
            )
          }

          const externalKey = createExternalKey(
            input.courseId,
            input.courseWorkId,
          )

          if (incomingExternalKeys.has(externalKey)) {
            throw new Error(
              `Snapshot contains duplicate task "${externalKey}".`,
            )
          }

          incomingExternalKeys.add(externalKey)
          const id =
            existingByExternalKey.get(externalKey)?.id ?? crypto.randomUUID()
          incomingRecords.push(toTaskRecord(input, id, externalKey))
        }

        await this.database.tasks.bulkPut(incomingRecords)

        const deletedTaskIds = existingTasks
          .filter((task) => !incomingExternalKeys.has(task.externalKey))
          .map((task) => task.id)

        if (deletedTaskIds.length > 0) {
          await this.database.tasks.bulkDelete(deletedTaskIds)
        }

        await this.database.syncStates.put({
          courseId: snapshot.courseId,
          fetchedDate: snapshot.fetchedDate,
        })
      },
    )
  }

  async removeInactiveCourses(
    activeCourseIds: readonly string[],
  ): Promise<void> {
    const activeCourseIdSet = new Set(activeCourseIds)

    await this.database.transaction(
      'rw',
      this.database.tasks,
      this.database.syncStates,
      async () => {
        const [tasks, syncStates] = await Promise.all([
          this.database.tasks.toArray(),
          this.database.syncStates.toArray(),
        ])
        const deletedTaskIds = tasks
          .filter((task) => !activeCourseIdSet.has(task.courseId))
          .map((task) => task.id)
        const deletedSyncStateIds = syncStates
          .filter((state) => !activeCourseIdSet.has(state.courseId))
          .map((state) => state.courseId)

        if (deletedTaskIds.length > 0) {
          await this.database.tasks.bulkDelete(deletedTaskIds)
        }

        if (deletedSyncStateIds.length > 0) {
          await this.database.syncStates.bulkDelete(deletedSyncStateIds)
        }
      },
    )
  }

  async getAllTasks(): Promise<TaskRecord[]> {
    return this.database.tasks.toArray()
  }

  async getUnsubmittedTasks(): Promise<TaskRecord[]> {
    const tasks = await this.database.tasks
      .where('status')
      .equals('unsubmitted')
      .toArray()

    return tasks.sort(compareTasksByDueDate)
  }

  async getUnsubmittedTasksInDateRange(
    startDate: string,
    endDate: string,
  ): Promise<TaskRecord[]> {
    if (startDate > endDate) {
      throw new Error('startDate must not be after endDate.')
    }

    return this.database.tasks
      .where('dueDate')
      .between(startDate, endDate, true, true)
      .filter((task) => task.status === 'unsubmitted')
      .sortBy('dueDate')
  }

  async getSyncStates(): Promise<SyncState[]> {
    return this.database.syncStates.orderBy('courseId').toArray()
  }

  async clearLocalData(): Promise<void> {
    await this.database.transaction(
      'rw',
      this.database.tasks,
      this.database.syncStates,
      async () => {
        await Promise.all([
          this.database.tasks.clear(),
          this.database.syncStates.clear(),
        ])
      },
    )
  }
}

export const taskRepository = new TaskRepository()

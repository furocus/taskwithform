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

//日付形式(YYYY-MM-DD)チェック
function validateDateString(value: string, name: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must be in YYYY-MM-DD format.`)
  }

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`${name} must be a valid date.`)
  }
}

function compareTasksByDueDate(a: TaskRecord, b: TaskRecord): number {
  if (a.dueDate === undefined && b.dueDate === undefined) {
    return compareTaskTieBreaker(a, b)
  }

  if (a.dueDate === undefined) {
    return 1
  }

  if (b.dueDate === undefined) {
    return -1
  }

  const dateOrder = a.dueDate.localeCompare(b.dueDate)

  if (dateOrder !== 0) {
    return dateOrder
  }

  return compareTaskTieBreaker(a, b)
}

function compareTaskTieBreaker(a: TaskRecord, b: TaskRecord): number {
  const titleComparison = a.title.localeCompare(b.title, 'ja')

  if (titleComparison !== 0) {
    return titleComparison
  }

  const courseNameComparison = a.courseName.localeCompare(b.courseName, 'ja')

  if (courseNameComparison !== 0) {
    return courseNameComparison
  }

  const courseWorkIdComparison = a.courseWorkId.localeCompare(b.courseWorkId)

  if (courseWorkIdComparison !== 0) {
    return courseWorkIdComparison
  }

  return a.externalKey.localeCompare(b.externalKey)
}

export class TaskRepository {
  constructor(
    private readonly database: TaskWithFormDatabase = defaultDatabase,
  ) {}

  /**
   * Every table the course synchronization writes.
   *
   * `replaceActiveCourseSnapshots` wraps `replaceCourseSnapshot` and
   * `removeInactiveCourses`, and Dexie turns their inner `transaction()` calls
   * into sub transactions of that outer one, which commit and roll back with
   * it. That only holds while all three declare the same tables, so a table
   * added to one of these writes has to be added here.
   */
  private get syncTables() {
    return [this.database.tasks, this.database.syncStates] as const
  }

  async replaceCourseSnapshot(snapshot: CourseTaskSnapshot): Promise<void> {
    await this.database.transaction('rw', ...this.syncTables, async () => {
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
          throw new Error(`Snapshot contains duplicate task "${externalKey}".`)
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
    })
  }

  /**
   * Replaces every ACTIVE course snapshot and drops the courses that are no
   * longer ACTIVE, in a single transaction. A failure on any course leaves the
   * previously stored courses untouched instead of committing a partial sync.
   *
   * See `syncTables` for the transaction scope this relies on.
   */
  async replaceActiveCourseSnapshots(
    snapshots: readonly CourseTaskSnapshot[],
  ): Promise<void> {
    await this.database.transaction('rw', ...this.syncTables, async () => {
      for (const snapshot of snapshots) {
        await this.replaceCourseSnapshot(snapshot)
      }

      await this.removeInactiveCourses(
        snapshots.map((snapshot) => snapshot.courseId),
      )
    })
  }

  async removeInactiveCourses(
    activeCourseIds: readonly string[],
  ): Promise<void> {
    const activeCourseIdSet = new Set(activeCourseIds)

    await this.database.transaction('rw', ...this.syncTables, async () => {
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
    })
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
    validateDateString(startDate, 'startDate')
    validateDateString(endDate, 'endDate')
    if (startDate > endDate) {
      throw new Error('startDate must not be after endDate.')
    }

    const tasks = await this.database.tasks
      .where('dueDate')
      .between(startDate, endDate, true, true)
      .filter((task) => task.status === 'unsubmitted')
      .toArray()

    return tasks.sort(compareTasksByDueDate)
  }

  async getTasksGroupedByDueDate(
    startDate: string,
    endDate: string,
  ): Promise<Record<string, TaskRecord[]>> {
    const tasks = await this.getUnsubmittedTasksInDateRange(startDate, endDate)

    return tasks.reduce<Record<string, TaskRecord[]>>((grouped, task) => {
      if (task.dueDate === undefined) {
        return grouped
      }

      const tasksForDate = grouped[task.dueDate] ?? []
      tasksForDate.push(task)
      grouped[task.dueDate] = tasksForDate

      return grouped
    }, {})
  }

  async getSyncStates(): Promise<SyncState[]> {
    return this.database.syncStates.orderBy('courseId').toArray()
  }

  async clearLocalData(): Promise<void> {
    await this.database.transaction('rw', ...this.syncTables, async () => {
      await Promise.all([
        this.database.tasks.clear(),
        this.database.syncStates.clear(),
      ])
    })
  }
}

export const taskRepository = new TaskRepository()

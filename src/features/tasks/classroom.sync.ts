import type {
  CourseTaskSnapshot,
  DateOnly,
  TaskFormReference,
  TaskRecord,
  TaskRecordInput,
} from '../../database/database.types'
import {
  createExternalKey,
  taskRepository as defaultTaskRepository,
  type TaskRepository,
} from '../../database/task.repository'
import { toDateOnly } from '../../shared/utils/date'
import {
  getClassroomItems,
  type ClassroomDistributionItem,
  type ClassroomItemsCourse,
} from './classroom.api'

/** The locally owned part of a task, which a re-sync must not overwrite. */
export type LocalTaskState = Pick<TaskRecord, 'status' | 'submittedAt'>

type FetchImplementation = typeof fetch

export interface SyncClassroomCoursesOptions {
  fetchImplementation?: FetchImplementation
  repository?: TaskRepository
  now?: () => Date
}

export interface SyncClassroomCoursesResult {
  /** Every ACTIVE course that was synchronized, including empty courses. */
  syncedCourseIds: string[]
  syncedTaskCount: number
}

function toTaskRecordInput(
  course: ClassroomItemsCourse,
  item: ClassroomDistributionItem,
  localState: LocalTaskState | undefined,
): TaskRecordInput {
  const forms: TaskFormReference[] = item.forms.map((form) => ({ ...form }))
  const input: TaskRecordInput = {
    courseId: course.id,
    courseName: course.name,
    itemType: item.itemType,
    itemId: item.itemId,
    creationTime: item.creationTime,
    // Classroom has no separate subject field, so the course name is the subject.
    subjectName: course.name,
    title: item.title,
    forms,
    // Keep this projection for answer-confirmation callers that still accept
    // URL arrays. Unresolved candidates intentionally do not become URLs.
    formUrls: [
      ...new Set(
        forms.flatMap((form) =>
          form.resolution === 'resolved' ? [form.formUrl] : [],
        ),
      ),
    ],
    // A task Classroom returns for the first time is unsubmitted until the
    // user acts on it locally.
    status: localState?.status ?? 'unsubmitted',
  }

  if (item.itemType === 'courseWork') {
    input.courseWorkId = item.itemId
    input.courseWorkType = item.courseWorkType
  }

  if (item.description !== undefined) {
    input.description = item.description
  }

  if (item.alternateLink !== undefined) {
    input.alternateLink = item.alternateLink
  }

  if (item.dueDate !== undefined) {
    input.dueDate = item.dueDate
  }

  if (input.status === 'submitted' && localState?.submittedAt !== undefined) {
    input.submittedAt = localState.submittedAt
  }

  return input
}

export function toCourseTaskSnapshot(
  course: ClassroomItemsCourse,
  fetchedDate: DateOnly,
  localStateByExternalKey: ReadonlyMap<string, LocalTaskState> = new Map(),
): CourseTaskSnapshot {
  return {
    courseId: course.id,
    fetchedDate,
    tasks: course.items
      .filter((item) => item.itemType === 'courseWork' || item.forms.length > 0)
      .map((item) =>
        toTaskRecordInput(
          course,
          item,
          localStateByExternalKey.get(
            createExternalKey(course.id, item.itemType, item.itemId),
          ) ??
            (item.itemType === 'courseWork'
              ? localStateByExternalKey.get(
                  createExternalKey(course.id, item.itemId),
                )
              : undefined),
        ),
      ),
  }
}

/**
 * Synchronizes every ACTIVE course, empty courses included, and drops the
 * courses that are no longer ACTIVE.
 *
 * The response is fully validated before the first write, and the writes share
 * one transaction, so neither a malformed response nor a failed write can leave
 * a partially synchronized database behind.
 *
 * Local task state is read before that transaction. Nothing else writes tasks
 * today; a future writer would have to be serialized against this sync.
 */
export async function syncClassroomCourses({
  fetchImplementation = fetch,
  repository = defaultTaskRepository,
  now = () => new Date(),
}: SyncClassroomCoursesOptions = {}): Promise<SyncClassroomCoursesResult> {
  const courses = await getClassroomItems(fetchImplementation)

  const storedTasks = await repository.getAllTasks()
  const localStateByExternalKey = new Map<string, LocalTaskState>(
    storedTasks.map((task) => [
      task.externalKey,
      task.submittedAt === undefined
        ? { status: task.status }
        : { status: task.status, submittedAt: task.submittedAt },
    ]),
  )

  const fetchedDate = toDateOnly(now())
  const snapshots = courses.map((course) =>
    toCourseTaskSnapshot(course, fetchedDate, localStateByExternalKey),
  )

  await repository.replaceActiveCourseSnapshots(snapshots)

  return {
    syncedCourseIds: courses.map((course) => course.id),
    syncedTaskCount: snapshots.reduce(
      (total, snapshot) => total + snapshot.tasks.length,
      0,
    ),
  }
}

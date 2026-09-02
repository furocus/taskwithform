import type {
  CourseTaskSnapshot,
  DateOnly,
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
  getClassroomCourses,
  type ClassroomCourse,
  type ClassroomCourseWork,
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
  course: ClassroomCourse,
  courseWork: ClassroomCourseWork,
  localState: LocalTaskState | undefined,
): TaskRecordInput {
  const input: TaskRecordInput = {
    courseId: course.id,
    courseName: course.name,
    courseWorkId: courseWork.courseWorkId,
    courseWorkType: courseWork.courseWorkType,
    // Classroom has no separate subject field, so the course name is the subject.
    subjectName: course.name,
    title: courseWork.title,
    // The same Form can be attached twice; one confirmation per URL is enough.
    formUrls: [...new Set(courseWork.forms.map((form) => form.formUrl))],
    // A task Classroom returns for the first time is unsubmitted until the
    // user acts on it locally.
    status: localState?.status ?? 'unsubmitted',
  }

  if (courseWork.description !== undefined) {
    input.description = courseWork.description
  }

  if (courseWork.alternateLink !== undefined) {
    input.alternateLink = courseWork.alternateLink
  }

  if (courseWork.dueDate !== undefined) {
    input.dueDate = courseWork.dueDate
  }

  if (input.status === 'submitted' && localState?.submittedAt !== undefined) {
    input.submittedAt = localState.submittedAt
  }

  return input
}

export function toCourseTaskSnapshot(
  course: ClassroomCourse,
  fetchedDate: DateOnly,
  localStateByExternalKey: ReadonlyMap<string, LocalTaskState> = new Map(),
): CourseTaskSnapshot {
  return {
    courseId: course.id,
    fetchedDate,
    tasks: course.courseWork.map((courseWork) =>
      toTaskRecordInput(
        course,
        courseWork,
        localStateByExternalKey.get(
          createExternalKey(course.id, courseWork.courseWorkId),
        ),
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
  const courses = await getClassroomCourses(fetchImplementation)

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

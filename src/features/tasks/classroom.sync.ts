import type {
  CourseTaskSnapshot,
  DateOnly,
  TaskRecordInput,
} from '../../database/database.types'
import {
  taskRepository as defaultTaskRepository,
  type TaskRepository,
} from '../../database/task.repository'
import { toDateOnly } from '../../shared/utils/date'
import {
  getClassroomCourses,
  type ClassroomCourse,
  type ClassroomCourseWork,
} from './classroom.api'

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
    // Classroom is the source of truth for whether the task was submitted.
    status: courseWork.submissionStatus,
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

  return input
}

export function toCourseTaskSnapshot(
  course: ClassroomCourse,
  fetchedDate: DateOnly,
): CourseTaskSnapshot {
  return {
    courseId: course.id,
    fetchedDate,
    tasks: course.courseWork.map((courseWork) =>
      toTaskRecordInput(course, courseWork),
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
 */
export async function syncClassroomCourses({
  fetchImplementation = fetch,
  repository = defaultTaskRepository,
  now = () => new Date(),
}: SyncClassroomCoursesOptions = {}): Promise<SyncClassroomCoursesResult> {
  const courses = await getClassroomCourses(fetchImplementation)

  const fetchedDate = toDateOnly(now())
  const snapshots = courses.map((course) =>
    toCourseTaskSnapshot(course, fetchedDate),
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

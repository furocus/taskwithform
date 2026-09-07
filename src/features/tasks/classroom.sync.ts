import type {
  CourseTaskSnapshot,
  DateOnly,
  TaskFormReference,
  TaskRecordInput,
} from '../../database/database.types'
import {
  taskRepository as defaultTaskRepository,
  type TaskRepository,
} from '../../database/task.repository'
import { createFormReferenceKey } from '../../database/formReference'
import { toDateOnly } from '../../shared/utils/date'
import {
  getClassroomItems,
  type ClassroomDistributionItem,
  type ClassroomItemsCourse,
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
  course: ClassroomItemsCourse,
  item: ClassroomDistributionItem,
): TaskRecordInput {
  // The stored `forms` array is the only representation of the Forms, so the
  // same Form attached twice to one item must not become two entries: they
  // would share a Form reference key and duplicate the UI card.
  const formsByKey = new Map<string, TaskFormReference>()
  for (const form of item.forms) {
    const key =
      form.resolution === 'resolved'
        ? createFormReferenceKey(form)
        : `unresolved:${form.sourceUrl}`
    if (!formsByKey.has(key)) formsByKey.set(key, { ...form })
  }
  const forms: TaskFormReference[] = [...formsByKey.values()]
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
    // Classroom is authoritative for every distribution item. Items without a
    // submission record arrive as 'untracked', so nothing is carried over from
    // the previous record.
    status: item.submissionStatus,
  }

  if (item.courseWorkType !== undefined) {
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

  return input
}

export function toCourseTaskSnapshot(
  course: ClassroomItemsCourse,
  fetchedDate: DateOnly,
): CourseTaskSnapshot {
  return {
    courseId: course.id,
    fetchedDate,
    tasks: course.items
      .filter((item) => item.itemType === 'courseWork' || item.forms.length > 0)
      .map((item) => toTaskRecordInput(course, item)),
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
 * Classroom owns the submission state of every item, so no local task state
 * survives a synchronization.
 */
export async function syncClassroomCourses({
  fetchImplementation = fetch,
  repository = defaultTaskRepository,
  now = () => new Date(),
}: SyncClassroomCoursesOptions = {}): Promise<SyncClassroomCoursesResult> {
  const courses = await getClassroomItems(fetchImplementation)

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

import type {
  ClassroomCourseWorkType,
  DateOnly,
} from '../../database/database.types'
import {
  BackendApiError,
  readBackendError,
  type FetchImplementation,
} from '../../shared/api/backendApi'
import { isExistingDateOnly } from '../../shared/utils/date'

/**
 * Course work types Classroom can return. Unknown values are rejected at the
 * API boundary so that an unexpected type never reaches the database.
 */
const COURSE_WORK_TYPES: readonly ClassroomCourseWorkType[] = [
  'ASSIGNMENT',
  'SHORT_ANSWER_QUESTION',
  'MULTIPLE_CHOICE_QUESTION',
]

/** A Google Form attached to a course work item. */
export interface ClassroomCourseWorkForm {
  formId: string
  formUrl: string
}

export interface ClassroomCourseWork {
  courseWorkId: string
  courseWorkType: ClassroomCourseWorkType
  title: string
  forms: ClassroomCourseWorkForm[]
  description?: string
  alternateLink?: string
  dueDate?: DateOnly
}

/**
 * One ACTIVE course. `courseWork` is empty for a course that has no published
 * course work, so an empty course is still part of the synchronized list.
 */
export interface ClassroomCourse {
  id: string
  name: string
  courseWork: ClassroomCourseWork[]
}

export interface ClassroomCourseListResponse {
  courses: ClassroomCourse[]
}

const INVALID_RESPONSE_CODE = 'invalid_backend_response'

/**
 * Why a course list was rejected. The code stays stable for callers while the
 * reason makes a rejection diagnosable during real-account validation.
 */
export type ClassroomResponseRejection =
  | 'missing_courses'
  | 'invalid_course'
  | 'duplicate_course'
  | 'invalid_course_work'
  | 'duplicate_course_work'
  | 'unknown_course_work_type'
  | 'invalid_due_date'
  | 'invalid_form'
  | 'missing_required_string'
  | 'invalid_optional_string'
  | 'unreadable_body'

function invalidResponse(
  status: number,
  reason: ClassroomResponseRejection,
): BackendApiError {
  return new BackendApiError(INVALID_RESPONSE_CODE, status, reason)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readRequiredString(value: unknown, status: number): string {
  if (typeof value !== 'string' || value === '') {
    throw invalidResponse(status, 'missing_required_string')
  }

  return value
}

/**
 * Optional text may legitimately be empty, so only its type is checked. An
 * empty description must not reject the whole course list.
 */
function readOptionalString(
  value: unknown,
  status: number,
): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'string') {
    throw invalidResponse(status, 'invalid_optional_string')
  }

  return value
}

function readCourseWorkType(
  value: unknown,
  status: number,
): ClassroomCourseWorkType {
  if (
    typeof value !== 'string' ||
    !COURSE_WORK_TYPES.includes(value as ClassroomCourseWorkType)
  ) {
    throw invalidResponse(status, 'unknown_course_work_type')
  }

  return value as ClassroomCourseWorkType
}

function readDueDate(value: unknown, status: number): DateOnly | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!isExistingDateOnly(value)) {
    throw invalidResponse(status, 'invalid_due_date')
  }

  return value
}

function readForm(value: unknown, status: number): ClassroomCourseWorkForm {
  if (!isRecord(value)) {
    throw invalidResponse(status, 'invalid_form')
  }

  return {
    formId: readRequiredString(value.formId, status),
    formUrl: readRequiredString(value.formUrl, status),
  }
}

function readCourseWork(value: unknown, status: number): ClassroomCourseWork {
  if (!isRecord(value) || !Array.isArray(value.forms)) {
    throw invalidResponse(status, 'invalid_course_work')
  }

  const courseWork: ClassroomCourseWork = {
    courseWorkId: readRequiredString(value.courseWorkId, status),
    courseWorkType: readCourseWorkType(value.courseWorkType, status),
    title: readRequiredString(value.title, status),
    forms: value.forms.map((form) => readForm(form, status)),
  }

  const description = readOptionalString(value.description, status)
  if (description !== undefined) {
    courseWork.description = description
  }

  const alternateLink = readOptionalString(value.alternateLink, status)
  if (alternateLink !== undefined) {
    courseWork.alternateLink = alternateLink
  }

  const dueDate = readDueDate(value.dueDate, status)
  if (dueDate !== undefined) {
    courseWork.dueDate = dueDate
  }

  return courseWork
}

function readCourse(value: unknown, status: number): ClassroomCourse {
  if (!isRecord(value) || !Array.isArray(value.courseWork)) {
    throw invalidResponse(status, 'invalid_course')
  }

  const courseWork = value.courseWork.map((item) =>
    readCourseWork(item, status),
  )
  const courseWorkIds = new Set<string>()
  for (const item of courseWork) {
    if (courseWorkIds.has(item.courseWorkId)) {
      throw invalidResponse(status, 'duplicate_course_work')
    }
    courseWorkIds.add(item.courseWorkId)
  }

  return {
    id: readRequiredString(value.id, status),
    name: readRequiredString(value.name, status),
    courseWork,
  }
}

/**
 * Validates the ACTIVE course list before any of it reaches the database. A
 * single malformed course rejects the whole response so that a partial course
 * list can never be mistaken for the user's full set of courses.
 */
export function parseClassroomCourseList(
  responseBody: unknown,
  status = 200,
): ClassroomCourse[] {
  if (!isRecord(responseBody) || !Array.isArray(responseBody.courses)) {
    throw invalidResponse(status, 'missing_courses')
  }

  const courses = responseBody.courses.map((course) =>
    readCourse(course, status),
  )
  const courseIds = new Set<string>()
  for (const course of courses) {
    if (courseIds.has(course.id)) {
      throw invalidResponse(status, 'duplicate_course')
    }
    courseIds.add(course.id)
  }

  return courses
}

export async function getClassroomCourses(
  fetchImplementation: FetchImplementation = fetch,
): Promise<ClassroomCourse[]> {
  const response = await fetchImplementation(
    '/api/classroom/courses/coursework',
    { credentials: 'same-origin' },
  )

  if (!response.ok) {
    throw await readBackendError(response)
  }

  let responseBody: unknown
  try {
    responseBody = await response.json()
  } catch {
    throw invalidResponse(response.status, 'unreadable_body')
  }

  return parseClassroomCourseList(responseBody, response.status)
}

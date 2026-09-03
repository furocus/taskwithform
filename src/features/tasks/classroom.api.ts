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

export type ClassroomDistributionItemType =
  'courseWork' | 'courseWorkMaterial' | 'announcement'

export type ClassroomDistributionForm =
  | {
      resolution: 'resolved'
      sourceUrl: string
      formId: string
      formUrl: string
      title?: string
    }
  | {
      resolution: 'unresolved'
      sourceUrl: string
      title?: string
    }

export interface ClassroomDistributionItem {
  itemId: string
  itemType: ClassroomDistributionItemType
  title: string
  description?: string
  alternateLink?: string
  dueDate?: DateOnly
  courseWorkType?: ClassroomCourseWorkType
  creationTime: string
  forms: ClassroomDistributionForm[]
}

export interface ClassroomItemsCourse {
  id: string
  name: string
  items: ClassroomDistributionItem[]
}

export interface ClassroomItemsResponse {
  courses: ClassroomItemsCourse[]
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
  | 'invalid_item_type'
  | 'invalid_creation_time'
  | 'invalid_form_reference'
  | 'duplicate_item'
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

function readDistributionItemType(
  value: unknown,
  status: number,
): ClassroomDistributionItemType {
  if (
    value !== 'courseWork' &&
    value !== 'courseWorkMaterial' &&
    value !== 'announcement'
  ) {
    throw invalidResponse(status, 'invalid_item_type')
  }
  return value
}

function readCreationTime(value: unknown, status: number): string {
  const input = typeof value === 'string' ? value : ''
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      input,
    )
  const year = match === null ? 0 : Number(match[1])
  const month = match === null ? 0 : Number(match[2])
  const day = match === null ? 0 : Number(match[3])
  const dateIsReal =
    match !== null &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (!dateIsReal || Number.isNaN(Date.parse(input))) {
    throw invalidResponse(status, 'invalid_creation_time')
  }
  return input
}

function readDistributionForm(
  value: unknown,
  status: number,
): ClassroomDistributionForm {
  if (!isRecord(value)) throw invalidResponse(status, 'invalid_form_reference')
  const resolution = value.resolution
  const sourceUrl = readRequiredString(value.sourceUrl, status)
  let source
  try {
    source = new URL(sourceUrl)
  } catch {
    throw invalidResponse(status, 'invalid_form_reference')
  }
  if (
    source.protocol !== 'https:' ||
    source.port !== '' ||
    source.username !== '' ||
    source.password !== '' ||
    source.search !== '' ||
    source.hash !== '' ||
    sourceUrl !== `${source.origin}${source.pathname}` ||
    !['docs.google.com', 'forms.google.com', 'forms.gle'].includes(
      source.hostname,
    )
  ) {
    throw invalidResponse(status, 'invalid_form_reference')
  }
  const sourcePath = source.pathname
  const validShort =
    source.hostname === 'forms.gle' && /^\/[^/]+$/.test(sourcePath)
  const validCanonical =
    (source.hostname === 'docs.google.com' &&
      /^\/forms\/d\/(?:e\/)?[A-Za-z0-9_-]+\/(?:edit|viewform)$/.test(
        sourcePath,
      )) ||
    (source.hostname === 'forms.google.com' &&
      /^(?:\/forms)?\/d\/(?:e\/)?[A-Za-z0-9_-]+\/(?:edit|viewform)$/.test(
        sourcePath,
      ))
  if (!validShort && !validCanonical) {
    throw invalidResponse(status, 'invalid_form_reference')
  }
  const title = readOptionalString(value.title, status)
  if (resolution === 'unresolved') {
    return title === undefined
      ? { resolution, sourceUrl }
      : { resolution, sourceUrl, title }
  }
  if (resolution !== 'resolved') {
    throw invalidResponse(status, 'invalid_form_reference')
  }
  const formId = readRequiredString(value.formId, status)
  const formUrl = readRequiredString(value.formUrl, status)
  let canonicalUrl
  try {
    canonicalUrl = new URL(formUrl)
  } catch {
    throw invalidResponse(status, 'invalid_form_reference')
  }
  if (
    canonicalUrl.protocol !== 'https:' ||
    canonicalUrl.port !== '' ||
    canonicalUrl.username !== '' ||
    canonicalUrl.password !== '' ||
    canonicalUrl.search !== '' ||
    canonicalUrl.hash !== '' ||
    canonicalUrl.hostname === 'forms.gle' ||
    !['docs.google.com', 'forms.google.com'].includes(canonicalUrl.hostname) ||
    formUrl !== `${canonicalUrl.origin}${canonicalUrl.pathname}`
  ) {
    throw invalidResponse(status, 'invalid_form_reference')
  }
  const formPathMatch =
    /^\/forms\/d\/(?:e\/)?([A-Za-z0-9_-]+)\/(?:edit|viewform)$/.exec(
      canonicalUrl.pathname,
    ) ??
    /^(?:\/forms)?\/d\/(?:e\/)?([A-Za-z0-9_-]+)\/(?:edit|viewform)$/.exec(
      canonicalUrl.pathname,
    )
  if (formPathMatch === null || formPathMatch[1] !== formId) {
    throw invalidResponse(status, 'invalid_form_reference')
  }
  return title === undefined
    ? { resolution, sourceUrl, formId, formUrl }
    : { resolution, sourceUrl, formId, formUrl, title }
}

function readDistributionItem(
  value: unknown,
  status: number,
): ClassroomDistributionItem {
  if (!isRecord(value) || !Array.isArray(value.forms)) {
    throw invalidResponse(status, 'invalid_form_reference')
  }
  const itemType = readDistributionItemType(value.itemType, status)
  const item: ClassroomDistributionItem = {
    itemId: readRequiredString(value.itemId, status),
    itemType,
    title: readRequiredString(value.title, status),
    creationTime: readCreationTime(value.creationTime, status),
    forms: value.forms.map((form) => readDistributionForm(form, status)),
  }
  const description = readOptionalString(value.description, status)
  const alternateLink = readOptionalString(value.alternateLink, status)
  const dueDate = readDueDate(value.dueDate, status)
  if (description !== undefined) item.description = description
  if (alternateLink !== undefined) item.alternateLink = alternateLink
  if (dueDate !== undefined) item.dueDate = dueDate
  if (value.courseWorkType !== undefined) {
    item.courseWorkType = readCourseWorkType(value.courseWorkType, status)
  }
  if (itemType === 'courseWork' && item.courseWorkType === undefined) {
    throw invalidResponse(status, 'unknown_course_work_type')
  }
  if (itemType !== 'courseWork' && value.dueDate !== undefined) {
    throw invalidResponse(status, 'invalid_due_date')
  }
  return item
}

export function parseClassroomItemsResponse(
  responseBody: unknown,
  status = 200,
): ClassroomItemsCourse[] {
  if (!isRecord(responseBody) || !Array.isArray(responseBody.courses)) {
    throw invalidResponse(status, 'missing_courses')
  }
  const courses = responseBody.courses.map((value) => {
    if (!isRecord(value) || !Array.isArray(value.items)) {
      throw invalidResponse(status, 'invalid_course')
    }
    const course: ClassroomItemsCourse = {
      id: readRequiredString(value.id, status),
      name: readRequiredString(value.name, status),
      items: value.items.map((item) => readDistributionItem(item, status)),
    }
    const itemKeys = new Set<string>()
    for (const item of course.items) {
      const key = `${item.itemType}:${item.itemId}`
      if (itemKeys.has(key)) throw invalidResponse(status, 'duplicate_item')
      itemKeys.add(key)
    }
    return course
  })
  const courseIds = new Set<string>()
  for (const course of courses) {
    if (courseIds.has(course.id))
      throw invalidResponse(status, 'duplicate_course')
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

export async function getClassroomItems(
  fetchImplementation: FetchImplementation = fetch,
): Promise<ClassroomItemsCourse[]> {
  const response = await fetchImplementation('/api/classroom/courses/items', {
    credentials: 'same-origin',
  })
  if (!response.ok) throw await readBackendError(response)

  let responseBody: unknown
  try {
    responseBody = await response.json()
  } catch {
    throw invalidResponse(response.status, 'unreadable_body')
  }
  // Keep the client tolerant of data written by an older mock/service during
  // a rolling deployment. The production endpoint always returns `items`;
  // this adapter is intentionally private and is removed once all clients are
  // on v3.
  if (
    isRecord(responseBody) &&
    Array.isArray(responseBody.courses) &&
    responseBody.courses.every(
      (course) => isRecord(course) && Array.isArray(course.courseWork),
    )
  ) {
    return parseClassroomItemsResponse(
      {
        courses: responseBody.courses.map((course) => ({
          id: course.id,
          name: course.name,
          items: (course.courseWork as unknown[]).map((rawItem) => {
            const item = rawItem as Record<string, unknown>
            return {
              itemId: item.courseWorkId,
              itemType: 'courseWork',
              title: item.title,
              description: item.description,
              alternateLink: item.alternateLink,
              dueDate: item.dueDate,
              courseWorkType: item.courseWorkType,
              creationTime: '1970-01-01T00:00:00.000Z',
              forms: (item.forms as unknown[]).map((rawForm) => {
                const form = rawForm as Record<string, unknown>
                return {
                  resolution: 'resolved',
                  sourceUrl: form.formUrl,
                  formId: form.formId,
                  formUrl: form.formUrl,
                }
              }),
            }
          }),
        })),
      },
      response.status,
    )
  }
  return parseClassroomItemsResponse(responseBody, response.status)
}

export const getClassroomCourseItems = getClassroomItems
export const parseClassroomCourseItems = parseClassroomItemsResponse

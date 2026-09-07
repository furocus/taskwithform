import type {
  ClassroomCourseWorkType,
  DateOnly,
  TaskStatus,
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

export type ClassroomDistributionItemType =
  'courseWork' | 'courseWorkMaterial' | 'announcement'

export type ClassroomDistributionForm =
  | {
      resolution: 'resolved'
      sourceUrl: string
      formId: string
      formIdType: 'standard' | 'published'
      formUrl: string
    }
  | {
      resolution: 'unresolved'
      sourceUrl: string
      reason: 'short_url_resolution_failed'
    }

export interface ClassroomDistributionItem {
  itemId: string
  itemType: ClassroomDistributionItemType
  title: string
  description?: string
  alternateLink?: string
  dueDate?: DateOnly
  courseWorkType?: ClassroomCourseWorkType
  /**
   * Course work carries the Classroom submission state of this user. Course
   * work assigned to other students only, materials and announcements have no
   * submission record and are always 'untracked'.
   */
  submissionStatus: TaskStatus
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
  | 'unknown_course_work_type'
  | 'invalid_submission_status'
  | 'invalid_due_date'
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

function readSubmissionStatus(
  value: unknown,
  itemType: ClassroomDistributionItemType,
  status: number,
): TaskStatus {
  if (value === 'untracked') {
    return value
  }

  // Only course work carries a Classroom submission record. Anything else
  // claiming to be submitted or unsubmitted means the contract is broken.
  if (
    itemType === 'courseWork' &&
    (value === 'unsubmitted' || value === 'submitted')
  ) {
    return value
  }

  throw invalidResponse(status, 'invalid_submission_status')
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
  const sourcePrefix =
    source.hostname === 'docs.google.com' ? '/forms' : '(?:/forms)?'
  const sourcePublishedMatch = new RegExp(
    `^${sourcePrefix}/d/e/[A-Za-z0-9_-]{1,512}/viewform$`,
  ).test(sourcePath)
  const sourceStandardMatch = new RegExp(
    `^${sourcePrefix}/d/(?!e/)[A-Za-z0-9_-]{1,512}/(?:edit|viewform)$`,
  ).test(sourcePath)
  const validCanonical =
    source.hostname !== 'forms.gle' &&
    (sourcePublishedMatch || sourceStandardMatch)
  if (!validShort && !validCanonical) {
    throw invalidResponse(status, 'invalid_form_reference')
  }
  if (resolution === 'unresolved') {
    if (
      source.hostname !== 'forms.gle' ||
      value.reason !== 'short_url_resolution_failed'
    ) {
      throw invalidResponse(status, 'invalid_form_reference')
    }
    return {
      resolution,
      sourceUrl,
      reason: 'short_url_resolution_failed',
    }
  }
  if (resolution !== 'resolved') {
    throw invalidResponse(status, 'invalid_form_reference')
  }
  const formId = readRequiredString(value.formId, status)
  const formIdType = value.formIdType
  if (formIdType !== 'standard' && formIdType !== 'published') {
    throw invalidResponse(status, 'invalid_form_reference')
  }
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
  if (!validShort && sourceUrl !== formUrl) {
    throw invalidResponse(status, 'invalid_form_reference')
  }
  const canonicalPrefix =
    canonicalUrl.hostname === 'docs.google.com' ? '/forms' : '(?:/forms)?'
  const publishedPathMatch = new RegExp(
    `^${canonicalPrefix}/d/e/([A-Za-z0-9_-]{1,512})/viewform$`,
  ).exec(canonicalUrl.pathname)
  const standardPathMatch = new RegExp(
    `^${canonicalPrefix}/d/([A-Za-z0-9_-]{1,512})/(?:edit|viewform)$`,
  ).exec(canonicalUrl.pathname)
  const formPathMatch = publishedPathMatch ?? standardPathMatch
  const parsedFormIdType =
    publishedPathMatch === null ? 'standard' : 'published'
  if (
    formPathMatch === null ||
    formPathMatch[1] !== formId ||
    parsedFormIdType !== formIdType
  ) {
    throw invalidResponse(status, 'invalid_form_reference')
  }
  return { resolution, sourceUrl, formId, formIdType, formUrl }
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
    submissionStatus: readSubmissionStatus(
      value.submissionStatus,
      itemType,
      status,
    ),
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
  return parseClassroomItemsResponse(responseBody, response.status)
}

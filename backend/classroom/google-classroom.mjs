import { isValidGoogleFormId } from '../google-form-id.mjs'

const CLASSROOM_COURSES_URL = 'https://classroom.googleapis.com/v1/courses'
const COURSE_PAGE_SIZE = '100'
const COURSE_WORK_PAGE_SIZE = '100'
const STUDENT_SUBMISSION_PAGE_SIZE = '100'
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
const STUDENT_SUBMISSION_STATES = new Set([
  'TURNED_IN',
  'RETURNED',
  'NEW',
  'CREATED',
  'RECLAIMED_BY_STUDENT',
])

export class ClassroomRequestError extends Error {
  constructor(code, { status, cause } = {}) {
    super('Google Classroom request failed.', { cause })
    this.name = 'ClassroomRequestError'
    this.code = code
    this.status = status
  }
}

function readPage(responseBody, collectionName) {
  if (
    responseBody === null ||
    typeof responseBody !== 'object' ||
    Array.isArray(responseBody) ||
    (responseBody[collectionName] !== undefined &&
      !Array.isArray(responseBody[collectionName])) ||
    (responseBody.nextPageToken !== undefined &&
      typeof responseBody.nextPageToken !== 'string')
  ) {
    throw new ClassroomRequestError('invalid_response')
  }

  return {
    items: responseBody[collectionName] ?? [],
    nextPageToken:
      responseBody.nextPageToken === ''
        ? undefined
        : responseBody.nextPageToken,
  }
}

async function fetchJson(
  fetchImplementation,
  requestUrl,
  accessToken,
  requestTimeoutMs,
) {
  let response
  try {
    response = await fetchImplementation(requestUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
  } catch (error) {
    throw new ClassroomRequestError('network_error', {
      cause: error,
    })
  }

  if (!response.ok) {
    throw new ClassroomRequestError('upstream_error', {
      status: response.status,
    })
  }

  try {
    return await response.json()
  } catch (error) {
    throw new ClassroomRequestError('invalid_response', {
      cause: error,
    })
  }
}

async function fetchAllPages({
  accessToken,
  collectionName,
  createRequestUrl,
  fetchImplementation,
  requestTimeoutMs,
}) {
  const items = []
  let pageToken
  const visitedPageTokens = new Set()

  do {
    const requestUrl = createRequestUrl(pageToken)
    const responseBody = await fetchJson(
      fetchImplementation,
      requestUrl,
      accessToken,
      requestTimeoutMs,
    )
    const page = readPage(responseBody, collectionName)
    items.push(...page.items)
    pageToken = page.nextPageToken

    if (pageToken !== undefined) {
      if (visitedPageTokens.has(pageToken)) {
        throw new ClassroomRequestError('invalid_response')
      }
      visitedPageTokens.add(pageToken)
    }
  } while (pageToken !== undefined)

  return items
}

function assertOptionalString(value) {
  return value === undefined || typeof value === 'string'
}

function readRequiredString(value) {
  if (typeof value !== 'string' || value === '') {
    throw new ClassroomRequestError('invalid_response')
  }
  return value
}

function readDueDate(value) {
  if (value === undefined) {
    return undefined
  }

  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Number.isInteger(value.year) ||
    !Number.isInteger(value.month) ||
    !Number.isInteger(value.day)
  ) {
    throw new ClassroomRequestError('invalid_response')
  }

  const year = String(value.year).padStart(4, '0')
  const month = String(value.month).padStart(2, '0')
  const day = String(value.day).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function extractGoogleFormIdDetails(formUrl) {
  let parsedUrl
  try {
    parsedUrl = new URL(formUrl)
  } catch {
    throw new ClassroomRequestError('invalid_response')
  }

  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.hostname !== 'docs.google.com' ||
    parsedUrl.port !== ''
  ) {
    throw new ClassroomRequestError('invalid_response')
  }

  let formId
  let formIdType
  const standardMatch = /^\/forms\/d\/([^/]+)\/(edit|viewform)$/.exec(
    parsedUrl.pathname,
  )
  const publishedMatch = /^\/forms\/d\/e\/([^/]+)\/viewform$/.exec(
    parsedUrl.pathname,
  )
  if (standardMatch !== null && standardMatch[1] !== 'e') {
    formId = standardMatch[1]
    formIdType = 'standard'
  } else if (publishedMatch !== null) {
    formId = publishedMatch[1]
    formIdType = 'published'
  } else {
    throw new ClassroomRequestError('invalid_response')
  }

  if (!isValidGoogleFormId(formId)) {
    throw new ClassroomRequestError('invalid_response')
  }

  return {
    formId,
    formIdType,
  }
}

export function extractGoogleFormId(formUrl) {
  return extractGoogleFormIdDetails(formUrl).formId
}

function mapCourseWork(courseWork) {
  if (
    courseWork === null ||
    typeof courseWork !== 'object' ||
    Array.isArray(courseWork) ||
    !assertOptionalString(courseWork.description) ||
    !assertOptionalString(courseWork.alternateLink) ||
    (courseWork.materials !== undefined && !Array.isArray(courseWork.materials))
  ) {
    throw new ClassroomRequestError('invalid_response')
  }

  const mapped = {
    courseWorkId: readRequiredString(courseWork.id),
    courseWorkType: readRequiredString(courseWork.workType),
    title: readRequiredString(courseWork.title),
    forms: [],
  }

  for (const material of courseWork.materials ?? []) {
    if (
      material === null ||
      typeof material !== 'object' ||
      Array.isArray(material)
    ) {
      throw new ClassroomRequestError('invalid_response')
    }

    if (material.form === undefined) {
      continue
    }

    if (
      material.form === null ||
      typeof material.form !== 'object' ||
      Array.isArray(material.form)
    ) {
      throw new ClassroomRequestError('invalid_response')
    }

    const formUrl = readRequiredString(material.form.formUrl)
    mapped.forms.push({
      ...extractGoogleFormIdDetails(formUrl),
      formUrl,
    })
  }

  if (courseWork.description !== undefined) {
    mapped.description = courseWork.description
  }
  if (courseWork.alternateLink !== undefined) {
    mapped.alternateLink = courseWork.alternateLink
  }

  const dueDate = readDueDate(courseWork.dueDate)
  if (dueDate !== undefined) {
    mapped.dueDate = dueDate
  }

  return mapped
}

function readStudentSubmission(submission) {
  if (
    submission === null ||
    typeof submission !== 'object' ||
    Array.isArray(submission)
  ) {
    throw new ClassroomRequestError('invalid_response')
  }

  const courseWorkId = readRequiredString(submission.courseWorkId)
  if (
    typeof submission.state !== 'string' ||
    !STUDENT_SUBMISSION_STATES.has(submission.state)
  ) {
    throw new ClassroomRequestError('invalid_response')
  }

  if (
    submission.assignedGrade !== undefined &&
    (typeof submission.assignedGrade !== 'number' ||
      !Number.isFinite(submission.assignedGrade) ||
      submission.assignedGrade < 0)
  ) {
    throw new ClassroomRequestError('invalid_response')
  }

  return {
    courseWorkId,
    state: submission.state,
    assignedGrade: submission.assignedGrade,
  }
}

function normalizeSubmissionStatus(submission) {
  return submission.state === 'TURNED_IN' ||
    submission.state === 'RETURNED' ||
    submission.assignedGrade !== undefined
    ? 'submitted'
    : 'unsubmitted'
}

export function createGoogleClassroomService({
  fetchImplementation = fetch,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
} = {}) {
  return {
    async countActiveCourses(accessToken) {
      const courses = await fetchAllPages({
        accessToken,
        collectionName: 'courses',
        fetchImplementation,
        requestTimeoutMs,
        createRequestUrl(pageToken) {
          const requestUrl = new URL(CLASSROOM_COURSES_URL)
          requestUrl.searchParams.set('courseStates', 'ACTIVE')
          requestUrl.searchParams.set('pageSize', COURSE_PAGE_SIZE)
          requestUrl.searchParams.set('fields', 'nextPageToken,courses(id)')
          if (pageToken !== undefined) {
            requestUrl.searchParams.set('pageToken', pageToken)
          }
          return requestUrl
        },
      })

      return courses.length
    },

    async listActiveCoursesWithCourseWork(accessToken) {
      const courses = await fetchAllPages({
        accessToken,
        collectionName: 'courses',
        fetchImplementation,
        requestTimeoutMs,
        createRequestUrl(pageToken) {
          const requestUrl = new URL(CLASSROOM_COURSES_URL)
          requestUrl.searchParams.set('courseStates', 'ACTIVE')
          requestUrl.searchParams.set('studentId', 'me')
          requestUrl.searchParams.set('pageSize', COURSE_PAGE_SIZE)
          requestUrl.searchParams.set(
            'fields',
            'nextPageToken,courses(id,name)',
          )
          if (pageToken !== undefined) {
            requestUrl.searchParams.set('pageToken', pageToken)
          }
          return requestUrl
        },
      })

      const result = []
      for (const course of courses) {
        if (
          course === null ||
          typeof course !== 'object' ||
          Array.isArray(course)
        ) {
          throw new ClassroomRequestError('invalid_response')
        }

        const normalizedCourse = {
          id: readRequiredString(course.id),
          name: readRequiredString(course.name),
        }
        const courseWorkUrl = new URL(
          `${CLASSROOM_COURSES_URL}/${encodeURIComponent(normalizedCourse.id)}/courseWork`,
        )
        const courseWorkItems = await fetchAllPages({
          accessToken,
          collectionName: 'courseWork',
          fetchImplementation,
          requestTimeoutMs,
          createRequestUrl(pageToken) {
            const requestUrl = new URL(courseWorkUrl)
            requestUrl.searchParams.set('courseWorkStates', 'PUBLISHED')
            requestUrl.searchParams.set('pageSize', COURSE_WORK_PAGE_SIZE)
            requestUrl.searchParams.set(
              'fields',
              'nextPageToken,courseWork(id,title,description,materials(form(formUrl)),alternateLink,dueDate,workType)',
            )
            if (pageToken !== undefined) {
              requestUrl.searchParams.set('pageToken', pageToken)
            }
            return requestUrl
          },
        })

        const mappedCourseWorkItems = courseWorkItems.map(mapCourseWork)
        const submissionsUrl = new URL(
          `${CLASSROOM_COURSES_URL}/${encodeURIComponent(normalizedCourse.id)}/courseWork/-/studentSubmissions`,
        )
        const submissions = await fetchAllPages({
          accessToken,
          collectionName: 'studentSubmissions',
          fetchImplementation,
          requestTimeoutMs,
          createRequestUrl(pageToken) {
            const requestUrl = new URL(submissionsUrl)
            requestUrl.searchParams.set('userId', 'me')
            requestUrl.searchParams.set(
              'fields',
              'nextPageToken,studentSubmissions(courseWorkId,state,assignedGrade)',
            )
            requestUrl.searchParams.set(
              'pageSize',
              STUDENT_SUBMISSION_PAGE_SIZE,
            )
            if (pageToken !== undefined) {
              requestUrl.searchParams.set('pageToken', pageToken)
            }
            return requestUrl
          },
        })

        const submissionByCourseWorkId = new Map()
        for (const submissionBody of submissions) {
          const submission = readStudentSubmission(submissionBody)
          if (submissionByCourseWorkId.has(submission.courseWorkId)) {
            throw new ClassroomRequestError('invalid_response')
          }
          submissionByCourseWorkId.set(
            submission.courseWorkId,
            normalizeSubmissionStatus(submission),
          )
        }

        const courseWork = mappedCourseWorkItems.map((courseWork) => {
          const submissionStatus = submissionByCourseWorkId.get(
            courseWork.courseWorkId,
          )
          if (submissionStatus === undefined) {
            throw new ClassroomRequestError('invalid_response')
          }

          return { ...courseWork, submissionStatus }
        })

        result.push({
          id: normalizedCourse.id,
          name: normalizedCourse.name,
          courseWork,
        })
      }

      return result
    },
  }
}

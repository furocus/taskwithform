import { isValidGoogleFormId } from '../google-form-id.mjs'

const CLASSROOM_COURSES_URL = 'https://classroom.googleapis.com/v1/courses'
const COURSE_PAGE_SIZE = '100'
const COURSE_WORK_PAGE_SIZE = '100'
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
const FORM_REDIRECT_TIMEOUT_MS = 5_000
const FORM_REDIRECT_MAX_HOPS = 3
const FORM_HOSTS = new Set(['docs.google.com', 'forms.google.com', 'forms.gle'])

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

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readOptionalStringOrThrow(value) {
  if (value !== undefined && typeof value !== 'string') {
    throw new ClassroomRequestError('invalid_response')
  }
  return value
}

function readCreationTime(value) {
  const match =
    typeof value === 'string'
      ? /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(
          value,
        )
      : null
  const year = match === null ? 0 : Number(match[1])
  const month = match === null ? 0 : Number(match[2])
  const day = match === null ? 0 : Number(match[3])
  const dateIsReal =
    match !== null &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (!dateIsReal || Number.isNaN(Date.parse(value))) {
    throw new ClassroomRequestError('invalid_response')
  }
  return value
}

/**
 * Parses only the URL forms that Classroom can safely expose as a Form.
 * Returning null is intentional for ordinary Classroom links and arbitrary
 * URLs in prose; attached `material.form` values call this through
 * `readFormCandidate` and reject unsupported/malformed values instead.
 */
function parseFormCandidate(value) {
  if (typeof value !== 'string' || value === '') return null

  let parsedUrl
  try {
    parsedUrl = new URL(value)
  } catch {
    return null
  }

  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.port !== '' ||
    parsedUrl.username !== '' ||
    parsedUrl.password !== '' ||
    !FORM_HOSTS.has(parsedUrl.hostname)
  ) {
    return null
  }

  const sourceUrl = `${parsedUrl.origin}${parsedUrl.pathname}`
  if (parsedUrl.hostname === 'forms.gle') {
    if (!/^\/[^/]+$/.test(parsedUrl.pathname)) return null
    return { kind: 'short', sourceUrl }
  }

  const path = parsedUrl.pathname
  const pathPrefix =
    parsedUrl.hostname === 'docs.google.com' ? '/forms/d/' : '/d/'
  const alternatePrefix = '/forms/d/'
  const canonicalPath = path.startsWith(pathPrefix)
    ? path
    : parsedUrl.hostname === 'forms.google.com' &&
        path.startsWith(alternatePrefix)
      ? path
      : null
  if (canonicalPath === null) return null

  const standardMatch = /^\/forms\/d\/([^/]+)\/(edit|viewform)$/.exec(
    canonicalPath,
  )
  const publishedMatch = /^\/forms\/d\/e\/([^/]+)\/viewform$/.exec(
    canonicalPath,
  )
  const formsHostStandardMatch = /^\/d\/([^/]+)\/(edit|viewform)$/.exec(
    canonicalPath,
  )
  const formsHostPublishedMatch = /^\/d\/e\/([^/]+)\/viewform$/.exec(
    canonicalPath,
  )

  let formId
  let formIdType
  if (standardMatch !== null && standardMatch[1] !== 'e') {
    formId = standardMatch[1]
    formIdType = 'standard'
  } else if (publishedMatch !== null) {
    formId = publishedMatch[1]
    formIdType = 'published'
  } else if (
    formsHostStandardMatch !== null &&
    formsHostStandardMatch[1] !== 'e'
  ) {
    formId = formsHostStandardMatch[1]
    formIdType = 'standard'
  } else if (formsHostPublishedMatch !== null) {
    formId = formsHostPublishedMatch[1]
    formIdType = 'published'
  } else {
    return null
  }

  if (!isValidGoogleFormId(formId)) return null
  return {
    kind: 'resolved',
    sourceUrl,
    formUrl: sourceUrl,
    formId,
    formIdType,
  }
}

function readFormCandidate(rawUrl, title) {
  if (typeof rawUrl !== 'string' || rawUrl === '') {
    throw new ClassroomRequestError('invalid_response')
  }
  if (title !== undefined && typeof title !== 'string') {
    throw new ClassroomRequestError('invalid_response')
  }
  const candidate = parseFormCandidate(rawUrl)
  if (candidate === null) {
    throw new ClassroomRequestError('invalid_response')
  }
  return title === undefined ? candidate : { ...candidate, title }
}

function findTextFormCandidates(text) {
  if (typeof text !== 'string' || text === '') return []

  // A candidate is deliberately limited to the three exact allowlisted host
  // names. Trailing punctuation is not part of a URL in ordinary prose.
  const matches = text.match(
    /https:\/\/(?:docs\.google\.com\/forms|forms\.google\.com|forms\.gle)\/[^\s<>"']+/gi,
  )
  if (matches === null) return []

  return matches.flatMap((match) => {
    let candidateUrl = match
    while (/[),.!?:;\]}]$/.test(candidateUrl)) {
      candidateUrl = candidateUrl.slice(0, -1)
    }
    const candidate = parseFormCandidate(candidateUrl)
    return candidate === null ? [] : [candidate]
  })
}

function collectMaterialCandidates(material) {
  if (!isRecord(material)) {
    throw new ClassroomRequestError('invalid_response')
  }

  const candidates = []
  if (material.form !== undefined) {
    if (!isRecord(material.form)) {
      throw new ClassroomRequestError('invalid_response')
    }
    candidates.push(
      readFormCandidate(material.form.formUrl, material.form.title),
    )
  }

  if (material.link !== undefined) {
    if (!isRecord(material.link)) {
      throw new ClassroomRequestError('invalid_response')
    }
    // A Link material is well-formed only when Classroom supplies its URL.
    // Ordinary links are ignored after validation; only exact Form URLs are
    // distribution candidates.
    const linkUrl = material.link.url
    if (typeof linkUrl !== 'string' || linkUrl === '') {
      throw new ClassroomRequestError('invalid_response')
    }
    const candidate = parseFormCandidate(linkUrl)
    if (candidate !== null) {
      candidates.push(
        material.link.title === undefined
          ? candidate
          : readFormCandidate(linkUrl, material.link.title),
      )
    } else if (
      material.link.title !== undefined &&
      typeof material.link.title !== 'string'
    ) {
      throw new ClassroomRequestError('invalid_response')
    }
  }

  return candidates
}

function collectItemCandidates(item, textFields) {
  if (item.materials !== undefined && !Array.isArray(item.materials)) {
    throw new ClassroomRequestError('invalid_response')
  }

  const candidates = (item.materials ?? []).flatMap(collectMaterialCandidates)
  for (const text of textFields) {
    if (text !== undefined && typeof text !== 'string') {
      throw new ClassroomRequestError('invalid_response')
    }
    candidates.push(...findTextFormCandidates(text))
  }
  return candidates
}

function canonicalFormReference(candidate) {
  return {
    resolution: 'resolved',
    sourceUrl: candidate.sourceUrl,
    formId: candidate.formId,
    formUrl: candidate.formUrl,
    ...(candidate.title === undefined ? {} : { title: candidate.title }),
  }
}

function unresolvedFormReference(candidate) {
  return {
    resolution: 'unresolved',
    sourceUrl: candidate.sourceUrl,
    ...(candidate.title === undefined ? {} : { title: candidate.title }),
  }
}

function isAllowedFormRedirectUrl(value) {
  return (
    value.protocol === 'https:' &&
    value.port === '' &&
    FORM_HOSTS.has(value.hostname)
  )
}

async function resolveShortFormUrl(
  candidate,
  fetchImplementation,
  requestCache,
) {
  const existing = requestCache.get(candidate.sourceUrl)
  if (existing !== undefined) return existing

  const resolutionPromise = (async () => {
    let requestUrl = new URL(candidate.sourceUrl)
    for (let hop = 0; hop <= FORM_REDIRECT_MAX_HOPS; hop += 1) {
      let response
      try {
        response = await fetchImplementation(requestUrl, {
          redirect: 'manual',
          referrer: '',
          signal: AbortSignal.timeout(FORM_REDIRECT_TIMEOUT_MS),
        })
      } catch {
        return null
      }

      if (response.status >= 300 && response.status < 400) {
        if (hop === FORM_REDIRECT_MAX_HOPS) return null
        const locationHeader = response.headers
        const location =
          locationHeader?.get?.('location') ??
          locationHeader?.location ??
          (locationHeader === null || typeof locationHeader !== 'object'
            ? undefined
            : Object.entries(locationHeader).find(
                ([key]) => key.toLowerCase() === 'location',
              )?.[1])
        if (typeof location !== 'string' || location === '') return null
        let nextUrl
        try {
          nextUrl = new URL(location, requestUrl)
        } catch {
          return null
        }
        if (!isAllowedFormRedirectUrl(nextUrl)) return null
        const resolved = parseFormCandidate(nextUrl.toString())
        if (resolved?.kind === 'resolved') return resolved
        if (resolved?.kind !== 'short') return null
        requestUrl = nextUrl
        continue
      }

      return null
    }
    return null
  })()

  requestCache.set(candidate.sourceUrl, resolutionPromise)
  return resolutionPromise
}

async function resolveFormCandidates(
  candidates,
  fetchImplementation,
  requestCache,
) {
  const resolved = []
  for (const candidate of candidates) {
    const resolution =
      candidate.kind === 'short'
        ? await resolveShortFormUrl(
            candidate,
            fetchImplementation,
            requestCache,
          )
        : candidate
    resolved.push({
      key:
        resolution === null
          ? `unresolved:${candidate.sourceUrl}`
          : `resolved:${resolution.formIdType ?? ''}:${resolution.formId}`,
      form:
        resolution === null
          ? unresolvedFormReference(candidate)
          : canonicalFormReference({
              ...resolution,
              sourceUrl: candidate.sourceUrl,
              title: candidate.title,
            }),
    })
  }

  const seen = new Map()
  for (const { key, form } of resolved) {
    const previous = seen.get(key)
    if (previous === undefined) {
      seen.set(key, form)
    } else if (previous.title === undefined && form.title !== undefined) {
      seen.set(key, form)
    }
  }
  return [...seen.values()]
}

function mapCommonDistributionFields(item, { itemId, itemType, title }) {
  if (!isRecord(item)) {
    throw new ClassroomRequestError('invalid_response')
  }
  const explicitDescription = readOptionalStringOrThrow(item.description)
  const text = readOptionalStringOrThrow(item.text)
  const description = explicitDescription ?? text
  const alternateLink = readOptionalStringOrThrow(item.alternateLink)
  return {
    itemId: readRequiredString(itemId),
    itemType,
    title: readRequiredString(title),
    creationTime: readCreationTime(item.creationTime),
    ...(description === undefined ? {} : { description }),
    ...(alternateLink === undefined ? {} : { alternateLink }),
  }
}

async function mapDistributionItem(
  item,
  { itemType, fetchImplementation, requestCache },
) {
  if (!isRecord(item)) {
    throw new ClassroomRequestError('invalid_response')
  }
  // Classroom announcements have no title field; their text is the visible
  // distribution title as well as the description used for Form detection.
  const title = readRequiredString(
    itemType === 'announcement'
      ? (item.title ?? item.text ?? 'お知らせ')
      : item.title,
  )
  const textFields =
    itemType === 'announcement' ? [item.text] : [item.description]
  const mapped = mapCommonDistributionFields(item, {
    itemId: item.id,
    itemType,
    title,
  })
  const candidates = collectItemCandidates(item, textFields)
  if (itemType === 'courseWork') {
    mapped.courseWorkType = readRequiredString(item.workType)
    const dueDate = readDueDate(item.dueDate)
    if (dueDate !== undefined) mapped.dueDate = dueDate
  }
  mapped.forms = await resolveFormCandidates(
    candidates,
    fetchImplementation,
    requestCache,
  )
  return mapped
}

async function mapCourseItems({
  course,
  courseWork,
  courseWorkMaterials,
  announcements,
  fetchImplementation,
  requestCache,
}) {
  const mappedCourseWork = await Promise.all(
    courseWork.map((item) =>
      mapDistributionItem(item, {
        itemType: 'courseWork',
        fetchImplementation,
        requestCache,
      }),
    ),
  )
  const mappedMaterials = await Promise.all(
    courseWorkMaterials.map((item) =>
      mapDistributionItem(item, {
        itemType: 'courseWorkMaterial',
        fetchImplementation,
        requestCache,
      }),
    ),
  )
  const mappedAnnouncements = await Promise.all(
    announcements.map((item) =>
      mapDistributionItem(item, {
        itemType: 'announcement',
        fetchImplementation,
        requestCache,
      }),
    ),
  )
  return {
    id: course.id,
    name: course.name,
    items: [
      ...mappedCourseWork,
      ...mappedMaterials.filter((item) => item.forms.length > 0),
      ...mappedAnnouncements.filter((item) => item.forms.length > 0),
    ],
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      results[index] = await mapper(items[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  )
  return results
}

function createRequestLimiter(limit) {
  let active = 0
  const queue = []
  const pump = () => {
    while (active < limit && queue.length > 0) {
      const { operation, resolve, reject } = queue.shift()
      active += 1
      Promise.resolve()
        .then(operation)
        .then(resolve, reject)
        .finally(() => {
          active -= 1
          pump()
        })
    }
  }
  return (operation) =>
    new Promise((resolve, reject) => {
      queue.push({ operation, resolve, reject })
      pump()
    })
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

        result.push({
          id: normalizedCourse.id,
          name: normalizedCourse.name,
          courseWork: courseWorkItems.map((courseWork) =>
            mapCourseWork(courseWork),
          ),
        })
      }

      return result
    },

    /**
     * Lists the complete distribution stream used by the application. This
     * intentionally lives beside (rather than replacing) the historical
     * courseWork endpoint: existing clients retain their old response and
     * scope contract while the new stream can add material/announcement
     * scopes and structured Form references.
     */
    async listActiveCoursesWithItems(accessToken) {
      const limitRequest = createRequestLimiter(6)
      const limitedFetch = (requestUrl, requestOptions) =>
        limitRequest(() => fetchImplementation(requestUrl, requestOptions))
      const courses = await fetchAllPages({
        accessToken,
        collectionName: 'courses',
        fetchImplementation: limitedFetch,
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

      const normalizedCourses = courses.map((course) => {
        if (!isRecord(course)) {
          throw new ClassroomRequestError('invalid_response')
        }
        return {
          id: readRequiredString(course.id),
          name: readRequiredString(course.name),
        }
      })
      const requestCache = new Map()

      return mapWithConcurrency(normalizedCourses, 4, async (course) => {
        const endpoint = (collectionName) =>
          new URL(
            `${CLASSROOM_COURSES_URL}/${encodeURIComponent(course.id)}/${collectionName}`,
          )
        const [courseWork, courseWorkMaterials, announcements] =
          await Promise.all([
            fetchAllPages({
              accessToken,
              collectionName: 'courseWork',
              fetchImplementation: limitedFetch,
              requestTimeoutMs,
              createRequestUrl(pageToken) {
                const requestUrl = endpoint('courseWork')
                requestUrl.searchParams.set('courseWorkStates', 'PUBLISHED')
                requestUrl.searchParams.set('pageSize', COURSE_WORK_PAGE_SIZE)
                requestUrl.searchParams.set(
                  'fields',
                  'nextPageToken,courseWork(id,title,description,materials(form(formUrl,title),link(url,title)),alternateLink,dueDate,workType,creationTime,state)',
                )
                if (pageToken !== undefined) {
                  requestUrl.searchParams.set('pageToken', pageToken)
                }
                return requestUrl
              },
            }),
            fetchAllPages({
              accessToken,
              collectionName: 'courseWorkMaterial',
              fetchImplementation: limitedFetch,
              requestTimeoutMs,
              createRequestUrl(pageToken) {
                const requestUrl = endpoint('courseWorkMaterials')
                requestUrl.searchParams.set(
                  'courseWorkMaterialStates',
                  'PUBLISHED',
                )
                requestUrl.searchParams.set('pageSize', COURSE_WORK_PAGE_SIZE)
                requestUrl.searchParams.set(
                  'fields',
                  'nextPageToken,courseWorkMaterial(id,title,description,materials(form(formUrl,title),link(url,title)),alternateLink,creationTime,state)',
                )
                if (pageToken !== undefined) {
                  requestUrl.searchParams.set('pageToken', pageToken)
                }
                return requestUrl
              },
            }),
            fetchAllPages({
              accessToken,
              collectionName: 'announcements',
              fetchImplementation: limitedFetch,
              requestTimeoutMs,
              createRequestUrl(pageToken) {
                const requestUrl = endpoint('announcements')
                requestUrl.searchParams.set('announcementStates', 'PUBLISHED')
                requestUrl.searchParams.set('pageSize', COURSE_WORK_PAGE_SIZE)
                requestUrl.searchParams.set(
                  'fields',
                  'nextPageToken,announcements(id,text,materials(form(formUrl,title),link(url,title)),alternateLink,creationTime,state)',
                )
                if (pageToken !== undefined) {
                  requestUrl.searchParams.set('pageToken', pageToken)
                }
                return requestUrl
              },
            }),
          ])

        const publishedOnly = (item) => {
          if (!isRecord(item)) {
            throw new ClassroomRequestError('invalid_response')
          }
          if (item.state !== undefined && typeof item.state !== 'string') {
            throw new ClassroomRequestError('invalid_response')
          }
          return item.state === undefined || item.state === 'PUBLISHED'
        }
        return mapCourseItems({
          course,
          courseWork: courseWork.filter(publishedOnly),
          courseWorkMaterials: courseWorkMaterials.filter(publishedOnly),
          announcements: announcements.filter(publishedOnly),
          fetchImplementation: limitedFetch,
          requestCache,
        })
      })
    },
  }
}

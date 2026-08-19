import { isValidGoogleFormId } from '../google-form-id.mjs'

export { isValidGoogleFormId } from '../google-form-id.mjs'

const GMAIL_PROFILE_URL =
  'https://gmail.googleapis.com/gmail/v1/users/me/profile'
const GMAIL_MESSAGES_URL =
  'https://gmail.googleapis.com/gmail/v1/users/me/messages'
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
const DEFAULT_OPERATION_TIMEOUT_MS = 30_000
const MAX_GMAIL_ERROR_BODY_BYTES = 8 * 1024
const MAX_GMAIL_ERROR_REASONS = 32
const MAX_GMAIL_ERROR_REASON_LENGTH = 128
const GMAIL_PAGE_SIZE = '100'
const MAX_SEARCH_PAGES = 10
const MAX_CANDIDATES = 100
const MAX_TOTAL_REQUESTS = 110
const FORM_RECEIPT_SENDER = 'forms-receipts-noreply@google.com'
const MAX_MIME_DEPTH = 32
const MAX_MIME_PARTS = 256
const MAX_SINGLE_DECODED_BYTES = 512 * 1024
const MAX_TOTAL_DECODED_BYTES = 2 * 1024 * 1024
const MAX_SINGLE_ENCODED_BYTES = Math.ceil(MAX_SINGLE_DECODED_BYTES / 3) * 4 + 4
const MAX_FORM_URL_STARTS = 1024
const MAX_FORM_URL_CANDIDATE_LENGTH = 16 * 1024

const MIME_UNREVIEWABLE = Symbol('mime-unreviewable')

const PERMISSION_REASONS = new Set([
  'ACCESS_TOKEN_SCOPE_INSUFFICIENT',
  'PERMISSION_DENIED',
  'domainPolicy',
  'domainPolicyBlocked',
  'domainPolicyViolation',
  'forbidden',
  'insufficientPermissions',
  'permissionDenied',
])

const RATE_LIMIT_REASONS = new Set([
  'DAILY_LIMIT_EXCEEDED',
  'RATE_LIMIT_EXCEEDED',
  'RESOURCE_EXHAUSTED',
  'USER_RATE_LIMIT_EXCEEDED',
  'dailyLimitExceeded',
  'quotaExceeded',
  'rateLimitExceeded',
  'resourceExhausted',
  'userRateLimitExceeded',
])

export class GmailRequestError extends Error {
  constructor(code, { status, cause } = {}) {
    super('Gmail request failed.', { cause })
    this.name = 'GmailRequestError'
    this.code = code
    this.status = status
  }
}

function readContentLength(response) {
  const headerValue =
    typeof response.headers?.get === 'function'
      ? response.headers.get('content-length')
      : response.headers?.['content-length']

  if (headerValue === undefined || headerValue === null) {
    return undefined
  }

  const normalizedValue = String(headerValue).trim()
  if (!/^\d+$/.test(normalizedValue)) {
    return undefined
  }

  const contentLength = Number(normalizedValue)
  return Number.isSafeInteger(contentLength) ? contentLength : Infinity
}

async function cancelResponseBody(response, reader) {
  try {
    if (reader !== undefined) {
      await reader.cancel()
    } else if (typeof response.body?.cancel === 'function') {
      await response.body.cancel()
    } else if (typeof response.body?.getReader === 'function') {
      const bodyReader = response.body.getReader()
      try {
        await bodyReader.cancel()
      } finally {
        if (typeof bodyReader.releaseLock === 'function') {
          bodyReader.releaseLock()
        }
      }
    }
  } catch {
    // The response is already being discarded, so cancellation failures are safe.
  }
}

async function readForbiddenBody(response) {
  const contentLength = readContentLength(response)
  if (contentLength > MAX_GMAIL_ERROR_BODY_BYTES) {
    await cancelResponseBody(response)
    return undefined
  }

  if (typeof response.body?.getReader !== 'function') {
    return undefined
  }

  const reader = response.body.getReader()
  const chunks = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      if (!(value instanceof Uint8Array) && !ArrayBuffer.isView(value)) {
        await cancelResponseBody(response, reader)
        return undefined
      }

      const chunk = new Uint8Array(
        value.buffer,
        value.byteOffset,
        value.byteLength,
      )
      totalBytes += chunk.byteLength
      if (totalBytes > MAX_GMAIL_ERROR_BODY_BYTES) {
        await cancelResponseBody(response, reader)
        return undefined
      }
      chunks.push(chunk)
    }

    const bodyBytes = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
      bodyBytes.set(chunk, offset)
      offset += chunk.byteLength
    }

    return JSON.parse(new TextDecoder().decode(bodyBytes))
  } catch {
    await cancelResponseBody(response, reader)
    return undefined
  } finally {
    if (typeof reader.releaseLock === 'function') {
      reader.releaseLock()
    }
  }
}

function classifyForbiddenBody(responseBody) {
  const errorDetails = responseBody?.error
  const reasonEntries =
    Array.isArray(errorDetails?.errors) && errorDetails.errors.length > 0
      ? errorDetails.errors
      : Array.isArray(errorDetails?.details)
        ? errorDetails.details
        : undefined

  if (
    responseBody === null ||
    typeof responseBody !== 'object' ||
    Array.isArray(responseBody) ||
    errorDetails === null ||
    typeof errorDetails !== 'object' ||
    Array.isArray(errorDetails) ||
    !Array.isArray(reasonEntries) ||
    reasonEntries.length === 0 ||
    reasonEntries.length > MAX_GMAIL_ERROR_REASONS
  ) {
    return undefined
  }

  const categories = new Set()
  for (const error of reasonEntries) {
    if (
      error === null ||
      typeof error !== 'object' ||
      Array.isArray(error) ||
      typeof error.reason !== 'string' ||
      error.reason.length === 0 ||
      error.reason.length > MAX_GMAIL_ERROR_REASON_LENGTH
    ) {
      return undefined
    }

    if (PERMISSION_REASONS.has(error.reason)) {
      categories.add('permission_denied')
    } else if (RATE_LIMIT_REASONS.has(error.reason)) {
      categories.add('rate_limited')
    } else {
      return undefined
    }
  }

  return categories.size === 1 ? categories.values().next().value : undefined
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
    throw new GmailRequestError('network_error', { cause: error })
  }

  if (
    response === null ||
    typeof response !== 'object' ||
    typeof response.ok !== 'boolean' ||
    !Number.isInteger(response.status)
  ) {
    throw new GmailRequestError('invalid_response')
  }

  if (!response.ok) {
    if (response.status === 429) {
      await cancelResponseBody(response)
      throw new GmailRequestError('rate_limited', { status: 429 })
    }

    const code =
      response.status === 403
        ? classifyForbiddenBody(await readForbiddenBody(response))
        : undefined
    throw new GmailRequestError(code ?? 'upstream_error', {
      status: response.status,
    })
  }

  if (typeof response.json !== 'function') {
    throw new GmailRequestError('invalid_response')
  }

  try {
    return await response.json()
  } catch (error) {
    throw new GmailRequestError('invalid_response', { cause: error })
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readMessageList(responseBody) {
  if (
    !isRecord(responseBody) ||
    (responseBody.messages !== undefined &&
      !Array.isArray(responseBody.messages)) ||
    (responseBody.nextPageToken !== undefined &&
      typeof responseBody.nextPageToken !== 'string')
  ) {
    throw new GmailRequestError('invalid_response')
  }

  const messages = responseBody.messages ?? []
  for (const message of messages) {
    if (!isRecord(message) || typeof message.id !== 'string' || !message.id) {
      throw new GmailRequestError('invalid_response')
    }
  }

  return {
    messages,
    nextPageToken:
      responseBody.nextPageToken === ''
        ? undefined
        : responseBody.nextPageToken,
  }
}

function createReceiptSearchQuery(formId) {
  return `from:${FORM_RECEIPT_SENDER} "${formId}"`
}

function createMimeFieldsSelector() {
  let partSelector = 'mimeType,body(data,attachmentId)'
  for (let depth = 0; depth < MAX_MIME_DEPTH; depth += 1) {
    partSelector = `mimeType,body(data,attachmentId),parts(${partSelector})`
  }
  return `id,internalDate,payload(${partSelector})`
}

function createOperationContext({
  now,
  operationTimeoutMs,
  requestTimeoutMs,
  fetchImplementation,
  accessToken,
}) {
  const deadline = now() + operationTimeoutMs
  let requestCount = 0

  function assertWithinDeadline() {
    const remainingMs = deadline - now()
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      throw new GmailRequestError('operation_timeout')
    }
    return remainingMs
  }

  return {
    assertWithinDeadline,
    async request(requestUrl) {
      const remainingMs = assertWithinDeadline()
      if (requestCount >= MAX_TOTAL_REQUESTS) {
        throw new GmailRequestError('request_limit')
      }
      requestCount += 1
      let responseBody
      try {
        responseBody = await fetchJson(
          fetchImplementation,
          requestUrl,
          accessToken,
          Math.max(1, Math.min(requestTimeoutMs, remainingMs)),
        )
      } catch (error) {
        assertWithinDeadline()
        throw error
      }
      assertWithinDeadline()
      return responseBody
    },
  }
}

async function listCandidateMessageIds({ formId, context }) {
  const messageIds = []
  const seenMessageIds = new Set()
  const visitedPageTokens = new Set()
  let pageToken
  let pageCount = 0

  while (true) {
    if (pageCount >= MAX_SEARCH_PAGES) {
      return { messageIds, complete: false }
    }
    pageCount += 1

    const requestUrl = new URL(GMAIL_MESSAGES_URL)
    requestUrl.searchParams.set('q', createReceiptSearchQuery(formId))
    requestUrl.searchParams.set('maxResults', GMAIL_PAGE_SIZE)
    requestUrl.searchParams.set('fields', 'nextPageToken,messages(id)')
    if (pageToken !== undefined) {
      requestUrl.searchParams.set('pageToken', pageToken)
    }

    const page = readMessageList(await context.request(requestUrl))
    for (const message of page.messages) {
      if (!seenMessageIds.has(message.id)) {
        if (messageIds.length >= MAX_CANDIDATES) {
          return { messageIds, complete: false }
        }
        seenMessageIds.add(message.id)
        messageIds.push(message.id)
      }
    }

    if (messageIds.length > MAX_CANDIDATES) {
      return { messageIds, complete: false }
    }
    if (page.nextPageToken === undefined) {
      return { messageIds, complete: true }
    }
    if (visitedPageTokens.has(page.nextPageToken)) {
      throw new GmailRequestError('invalid_response')
    }
    visitedPageTokens.add(page.nextPageToken)
    pageToken = page.nextPageToken
  }
}

function readMessageResponse(responseBody, expectedMessageId) {
  if (
    !isRecord(responseBody) ||
    typeof responseBody.id !== 'string' ||
    responseBody.id !== expectedMessageId ||
    (responseBody.internalDate !== undefined &&
      typeof responseBody.internalDate !== 'string')
  ) {
    throw new GmailRequestError('invalid_response')
  }
  return responseBody
}

async function getMessage({ messageId, context }) {
  const requestUrl = new URL(
    `${GMAIL_MESSAGES_URL}/${encodeURIComponent(messageId)}`,
  )
  requestUrl.searchParams.set('format', 'full')
  requestUrl.searchParams.set('fields', createMimeFieldsSelector())

  return readMessageResponse(await context.request(requestUrl), messageId)
}

function isValidBase64Url(value) {
  if (typeof value !== 'string' || value.length > MAX_SINGLE_ENCODED_BYTES) {
    return false
  }
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(value)) {
    return false
  }

  const paddingIndex = value.indexOf('=')
  const unpadded = paddingIndex === -1 ? value : value.slice(0, paddingIndex)
  const paddingLength = value.length - unpadded.length
  if (unpadded.length % 4 === 1) {
    return false
  }
  return paddingLength === 0 || value.length % 4 === 0
}

function decodeBase64UrlUtf8(value) {
  if (!isValidBase64Url(value)) {
    return MIME_UNREVIEWABLE
  }

  const unpadded = value.replace(/=+$/, '')
  const standardBase64 = unpadded.replace(/-/g, '+').replace(/_/g, '/')
  const padding = (4 - (standardBase64.length % 4)) % 4

  try {
    const bytes = Buffer.from(
      `${standardBase64}${'='.repeat(padding)}`,
      'base64',
    )
    if (bytes.toString('base64url') !== unpadded) {
      return MIME_UNREVIEWABLE
    }
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      byteLength: bytes.byteLength,
    }
  } catch {
    return MIME_UNREVIEWABLE
  }
}

function collectMimeText(rootPart) {
  const textParts = []
  const stack = [{ part: rootPart, depth: 0 }]
  let partCount = 0
  let totalDecodedBytes = 0

  while (stack.length > 0) {
    const { part, depth } = stack.pop()
    partCount += 1
    if (partCount > MAX_MIME_PARTS || depth > MAX_MIME_DEPTH) {
      return { reviewable: false, textParts }
    }
    if (
      !isRecord(part) ||
      typeof part.mimeType !== 'string' ||
      !part.mimeType
    ) {
      return { reviewable: false, textParts }
    }

    const mimeType = part.mimeType.toLowerCase()
    if (mimeType.startsWith('multipart/')) {
      if (
        (part.body !== undefined &&
          (!isRecord(part.body) || Object.keys(part.body).length > 0)) ||
        !Array.isArray(part.parts) ||
        part.parts.length === 0 ||
        part.parts.length > MAX_MIME_PARTS
      ) {
        return { reviewable: false, textParts }
      }
      for (let index = part.parts.length - 1; index >= 0; index -= 1) {
        stack.push({ part: part.parts[index], depth: depth + 1 })
      }
      continue
    }

    if (mimeType !== 'text/plain' && mimeType !== 'text/html') {
      // Binary content is never evidence of a Form receipt. Its data is not
      // decoded, but the MIME node itself must remain structurally bounded.
      if (
        (part.body !== undefined &&
          (!isRecord(part.body) ||
            (part.body.data !== undefined &&
              (typeof part.body.data !== 'string' ||
                part.body.data.length > MAX_SINGLE_ENCODED_BYTES)) ||
            (part.body.attachmentId !== undefined &&
              typeof part.body.attachmentId !== 'string'))) ||
        (part.parts !== undefined &&
          (!Array.isArray(part.parts) || part.parts.length > 0))
      ) {
        return { reviewable: false, textParts }
      }
      continue
    }

    if (
      !isRecord(part.body) ||
      Object.hasOwn(part.body, 'attachmentId') ||
      typeof part.body.data !== 'string'
    ) {
      return { reviewable: false, textParts }
    }
    const decoded = decodeBase64UrlUtf8(part.body.data)
    if (
      decoded === MIME_UNREVIEWABLE ||
      decoded.byteLength > MAX_SINGLE_DECODED_BYTES ||
      totalDecodedBytes + decoded.byteLength > MAX_TOTAL_DECODED_BYTES
    ) {
      return { reviewable: false, textParts }
    }
    totalDecodedBytes += decoded.byteLength
    textParts.push(decoded.text)

    if (
      part.parts !== undefined &&
      (!Array.isArray(part.parts) || part.parts.length > 0)
    ) {
      return { reviewable: false, textParts }
    }
  }

  return { reviewable: true, textParts }
}

function extractFormIds(text) {
  const formIds = new Set()
  let invalidFormUrl = false
  const urlStartPattern = /https?:\/\//giu
  const delimiterPattern = /[\s<>"']/gu
  let startMatch
  let delimiterMatch = delimiterPattern.exec(text)
  let startCount = 0

  while ((startMatch = urlStartPattern.exec(text)) !== null) {
    startCount += 1
    if (startCount > MAX_FORM_URL_STARTS) {
      invalidFormUrl = true
      break
    }

    const start = startMatch.index
    while (delimiterMatch !== null && delimiterMatch.index <= start) {
      delimiterMatch = delimiterPattern.exec(text)
    }
    const delimiterIndex = delimiterMatch?.index
    const remainderLength = (delimiterIndex ?? text.length) - start
    const candidateLength = Math.min(
      remainderLength,
      MAX_FORM_URL_CANDIDATE_LENGTH,
    )
    if (remainderLength > MAX_FORM_URL_CANDIDATE_LENGTH) {
      invalidFormUrl = true
    }
    const candidate = text
      .slice(start, start + candidateLength)
      .replace(/[),.;!?]+$/u, '')
    let parsedUrl
    try {
      parsedUrl = new URL(candidate)
    } catch {
      continue
    }

    if (
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.hostname !== 'docs.google.com' ||
      parsedUrl.port !== ''
    ) {
      continue
    }

    const standardMatch = /^\/forms\/d\/([^/]+)\/(viewform|edit)$/.exec(
      parsedUrl.pathname,
    )
    const publishedMatch = /^\/forms\/d\/e\/([^/]+)\/viewform$/.exec(
      parsedUrl.pathname,
    )
    if (standardMatch?.[1] === 'e') {
      invalidFormUrl = true
      continue
    }
    const formId = standardMatch?.[1] ?? publishedMatch?.[1]
    if (formId === undefined) {
      continue
    }
    if (!isValidGoogleFormId(formId)) {
      invalidFormUrl = true
      continue
    }
    formIds.add(formId)
  }

  return { formIds, invalidFormUrl }
}

function inspectMessage(message, formId) {
  const mime = collectMimeText(message.payload)
  if (!mime.reviewable) {
    return { matches: false, ambiguous: false, reviewable: false }
  }

  const formIds = new Set()
  let invalidFormUrl = false
  for (const text of mime.textParts) {
    const extracted = extractFormIds(text)
    for (const extractedFormId of extracted.formIds) {
      formIds.add(extractedFormId)
    }
    invalidFormUrl ||= extracted.invalidFormUrl
  }

  const matches = formIds.has(formId)
  const ambiguous =
    invalidFormUrl || [...formIds].some((candidateId) => candidateId !== formId)
  let receiptReceivedAt
  if (matches && typeof message.internalDate === 'string') {
    const milliseconds = Number(message.internalDate)
    if (
      /^[0-9]+$/.test(message.internalDate) &&
      Number.isSafeInteger(milliseconds) &&
      milliseconds >= 0 &&
      milliseconds <= 8.64e15
    ) {
      const date = new Date(milliseconds)
      if (!Number.isNaN(date.getTime())) {
        receiptReceivedAt = date.toISOString()
      }
    }
  }

  return { matches, ambiguous, reviewable: true, receiptReceivedAt }
}

async function checkFormResponse({
  accessToken,
  formId,
  fetchImplementation,
  requestTimeoutMs,
  now,
  operationTimeoutMs,
}) {
  if (!isValidGoogleFormId(formId)) {
    throw new GmailRequestError('invalid_form_id')
  }

  const context = createOperationContext({
    now,
    operationTimeoutMs,
    requestTimeoutMs,
    fetchImplementation,
    accessToken,
  })
  const searchResult = await listCandidateMessageIds({ formId, context })
  if (!searchResult.complete || searchResult.messageIds.length === 0) {
    return searchResult.complete
      ? { status: 'unreviewable' }
      : { status: 'needsReview' }
  }

  const inspectedMessages = []
  for (const messageId of searchResult.messageIds) {
    const message = await getMessage({ messageId, context })
    inspectedMessages.push(inspectMessage(message, formId))
    context.assertWithinDeadline()
  }

  const matchingMessages = inspectedMessages.filter(
    (message) => message.matches,
  )
  if (
    inspectedMessages.some(
      (message) => !message.reviewable || message.ambiguous,
    ) ||
    matchingMessages.length > 1
  ) {
    return { status: 'needsReview' }
  }

  if (matchingMessages.length === 0) {
    return { status: 'unreviewable' }
  }

  const receiptReceivedAt = matchingMessages[0].receiptReceivedAt
  return receiptReceivedAt === undefined
    ? { status: 'needsReview' }
    : { status: 'submitted', receiptReceivedAt }
}

export function createGoogleGmailService({
  fetchImplementation = fetch,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  now = () => Date.now(),
  operationTimeoutMs = DEFAULT_OPERATION_TIMEOUT_MS,
} = {}) {
  return {
    async checkConnection(accessToken) {
      const requestUrl = new URL(GMAIL_PROFILE_URL)
      requestUrl.searchParams.set('fields', 'historyId')

      const responseBody = await fetchJson(
        fetchImplementation,
        requestUrl,
        accessToken,
        requestTimeoutMs,
      )
      if (
        !isRecord(responseBody) ||
        typeof responseBody.historyId !== 'string' ||
        responseBody.historyId === ''
      ) {
        throw new GmailRequestError('invalid_response')
      }
    },

    async checkFormResponse(accessToken, formId) {
      return checkFormResponse({
        accessToken,
        formId,
        fetchImplementation,
        requestTimeoutMs,
        now,
        operationTimeoutMs,
      })
    },
  }
}

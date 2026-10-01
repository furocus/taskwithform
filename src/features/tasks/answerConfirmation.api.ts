import type { AnswerStatus } from './task.types'

export type FormConfirmationStatus =
  'submitted' | 'unreviewable' | 'needsReview'

export type FormConfirmationReason = 'standard_id_not_matchable'

export interface FormConfirmationResult {
  formUrl: string
  status: FormConfirmationStatus
  reason?: FormConfirmationReason
}

export type AnswerConfirmationErrorCode =
  | 'permission_denied'
  | 'session_expired'
  | 'temporary_error'
  | 'invalid_form_url'
  | 'invalid_backend_response'

export interface AnswerConfirmationError extends Error {
  code: AnswerConfirmationErrorCode
  status?: number
  retryable: boolean
}

export interface CheckTaskAnswerConfirmationResponse {
  taskId: string
  formResults: FormConfirmationResult[]
  status: AnswerStatus
}

export interface CheckTaskAnswerConfirmationInput {
  taskId: string
  formUrls: readonly string[]
}

export type FetchImplementation = typeof fetch

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function createAnswerConfirmationError(
  code: AnswerConfirmationErrorCode,
  status = 500,
): AnswerConfirmationError {
  const retryable =
    code === 'permission_denied' ||
    code === 'session_expired' ||
    code === 'temporary_error'

  const error = new Error(code) as AnswerConfirmationError
  error.name = 'AnswerConfirmationError'
  error.code = code
  error.status = status
  error.retryable = retryable

  return error
}

export function extractFormId(formUrl: string): string {
  return extractFormIdDetails(formUrl).formId
}

export interface FormIdDetails {
  formId: string
  formIdType: 'standard' | 'published'
}

export function extractFormIdDetails(formUrl: string): FormIdDetails {
  try {
    const url = new URL(formUrl)
    if (
      url.protocol !== 'https:' ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== '' ||
      (url.hostname !== 'docs.google.com' &&
        url.hostname !== 'forms.google.com')
    ) {
      throw new Error('unsupported URL')
    }

    const prefix = url.hostname === 'docs.google.com' ? '/forms' : '(?:/forms)?'
    const publishedMatch = new RegExp(
      `^${prefix}/d/e/([A-Za-z0-9_-]{1,512})/viewform/?$`,
    ).exec(url.pathname)
    if (publishedMatch !== null) {
      return { formId: publishedMatch[1]!, formIdType: 'published' }
    }

    const standardMatch = new RegExp(
      `^${prefix}/d/([A-Za-z0-9_-]{1,512})/(?:viewform|edit)/?$`,
    ).exec(url.pathname)
    if (standardMatch !== null && standardMatch[1] !== 'e') {
      return { formId: standardMatch[1]!, formIdType: 'standard' }
    }
  } catch {
    // The stable validation error below deliberately replaces legacy fallback
    // parsing of arbitrary URL path segments and raw IDs.
  }

  throw createAnswerConfirmationError('invalid_form_url', 400)
}

export function aggregateAnswerConfirmationResults(
  results: readonly FormConfirmationResult[],
): AnswerStatus {
  if (results.length === 0) {
    return 'unreviewed'
  }

  const hasNeedsReview = results.some(
    (result) => result.status === 'needsReview',
  )

  if (hasNeedsReview) {
    return 'needsReview'
  }

  const allSubmitted = results.every((result) => result.status === 'submitted')

  if (allSubmitted) {
    return 'submitted'
  }

  const hasSubmitted = results.some((result) => result.status === 'submitted')

  if (hasSubmitted) {
    return 'needsReview'
  }

  return 'unreviewable'
}

async function readAnswerConfirmationError(
  response: Response,
): Promise<AnswerConfirmationError> {
  try {
    const responseBody = (await response.json()) as {
      error?: { code?: unknown }
    }

    if (typeof responseBody.error?.code === 'string') {
      const code = responseBody.error.code
      if (code === 'session_expired') {
        return createAnswerConfirmationError('session_expired', response.status)
      }
      if (code === 'gmail_forbidden') {
        return createAnswerConfirmationError(
          'permission_denied',
          response.status,
        )
      }
      if (code === 'invalid_form_id' || code === 'invalid_form_id_type') {
        return createAnswerConfirmationError(
          'invalid_form_url',
          response.status,
        )
      }
    }
  } catch {
    // ignore malformed backend payloads and fall back to a stable client error
  }

  return createAnswerConfirmationError('temporary_error', response.status)
}

export async function checkTaskAnswerConfirmation(
  input: CheckTaskAnswerConfirmationInput,
  fetchImplementation: FetchImplementation = fetch,
): Promise<CheckTaskAnswerConfirmationResponse> {
  if (input.formUrls.length === 0) {
    return {
      taskId: input.taskId,
      formResults: [],
      status: 'unreviewed',
    }
  }

  const formResults: FormConfirmationResult[] = await Promise.all(
    input.formUrls.map(async (formUrl) => {
      const { formId, formIdType } = extractFormIdDetails(formUrl)
      const response = await fetchImplementation(
        `/api/gmail/forms/${encodeURIComponent(formId)}/response?formIdType=${formIdType}`,
        {
          method: 'GET',
          credentials: 'same-origin',
        },
      )

      if (!response.ok) {
        throw await readAnswerConfirmationError(response)
      }

      let responseBody: unknown
      try {
        responseBody = await response.json()
      } catch {
        throw createAnswerConfirmationError('invalid_backend_response')
      }
      if (!isRecord(responseBody)) {
        throw createAnswerConfirmationError('invalid_backend_response')
      }

      const rawStatus = responseBody.status
      if (
        typeof rawStatus !== 'string' ||
        (rawStatus !== 'submitted' &&
          rawStatus !== 'unreviewable' &&
          rawStatus !== 'needsReview')
      ) {
        throw createAnswerConfirmationError('invalid_backend_response')
      }

      const reason = responseBody.reason
      if (
        (formIdType === 'standard' &&
          (rawStatus !== 'unreviewable' ||
            reason !== 'standard_id_not_matchable')) ||
        (formIdType === 'published' && reason !== undefined)
      ) {
        throw createAnswerConfirmationError('invalid_backend_response')
      }

      return {
        formUrl,
        status: rawStatus as FormConfirmationStatus,
        ...(reason === undefined
          ? {}
          : { reason: reason as FormConfirmationReason }),
      }
    }),
  )

  return {
    taskId: input.taskId,
    formResults,
    status: aggregateAnswerConfirmationResults(formResults),
  }
}

export const mockAnswerConfirmationApi = {
  async checkTaskAnswerConfirmation(
    input: CheckTaskAnswerConfirmationInput,
  ): Promise<CheckTaskAnswerConfirmationResponse> {
    const formResults: FormConfirmationResult[] = input.formUrls.map(
      (formUrl) => {
        const seed = formUrl.split('/').at(-1) ?? formUrl
        const status: FormConfirmationStatus = seed.includes('submitted')
          ? 'submitted'
          : seed.includes('needs')
            ? 'needsReview'
            : seed.includes('unreviewable')
              ? 'unreviewable'
              : 'unreviewable'

        return { formUrl, status }
      },
    )

    return {
      taskId: input.taskId,
      formResults,
      status: aggregateAnswerConfirmationResults(formResults),
    }
  },
}

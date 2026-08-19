import type { AnswerStatus } from './task.types'

export type FormConfirmationStatus =
  | 'submitted'
  | 'unreviewable'
  | 'needsReview'
  | 'answered'
  | 'needs_review'
  | 'pending'

export interface FormConfirmationResult {
  formUrl: string
  status: FormConfirmationStatus
}

export type AnswerConfirmationErrorCode =
  | 'permission_denied'
  | 'session_expired'
  | 'temporary_error'
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
  try {
    const url = new URL(formUrl)
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length > 0) {
      return segments[segments.length - 1]!
    }
  } catch {
    // not a valid URL, fall back to string manipulation
  }
  const clean = formUrl.replace(/\/+$/, '')
  const lastPart = clean.split('/').pop()
  return lastPart || formUrl
}

export function aggregateAnswerConfirmationResults(
  results: readonly FormConfirmationResult[],
): AnswerStatus {
  if (results.length === 0) {
    return 'unreviewed'
  }

  const hasNeedsReview = results.some(
    (result) =>
      result.status === 'needsReview' || result.status === 'needs_review',
  )

  if (hasNeedsReview) {
    return 'needsReview'
  }

  const allSubmitted = results.every(
    (result) => result.status === 'submitted' || result.status === 'answered',
  )

  if (allSubmitted) {
    return 'submitted'
  }

  const hasSubmitted = results.some(
    (result) => result.status === 'submitted' || result.status === 'answered',
  )

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
      const code = responseBody.error.code as AnswerConfirmationErrorCode
      return createAnswerConfirmationError(code, response.status)
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
      const formId = extractFormId(formUrl)
      const response = await fetchImplementation(
        `/api/gmail/forms/${encodeURIComponent(formId)}/response`,
        {
          method: 'GET',
          credentials: 'same-origin',
        },
      )

      if (!response.ok) {
        throw await readAnswerConfirmationError(response)
      }

      const responseBody = (await response.json()) as {
        formId?: unknown
        status?: unknown
      }

      const rawStatus = responseBody.status
      if (
        typeof rawStatus !== 'string' ||
        (rawStatus !== 'submitted' &&
          rawStatus !== 'unreviewable' &&
          rawStatus !== 'needsReview' &&
          rawStatus !== 'answered' &&
          rawStatus !== 'needs_review' &&
          rawStatus !== 'pending')
      ) {
        throw createAnswerConfirmationError('invalid_backend_response')
      }

      return {
        formUrl,
        status: rawStatus as FormConfirmationStatus,
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
        const status: FormConfirmationStatus =
          seed.includes('answered') || seed.includes('submitted')
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

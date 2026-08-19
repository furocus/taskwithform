import type { AnswerStatus } from './task.types'

export type FormConfirmationStatus =
  'answered' | 'pending' | 'needs_review' | 'unreviewable'

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

export function aggregateAnswerConfirmationResults(
  results: readonly FormConfirmationResult[],
): AnswerStatus {
  if (results.length === 0) {
    return 'unreviewed'
  }

  const hasAnswered = results.some((result) => result.status === 'answered')
  const hasNeedsReview = results.some(
    (result) => result.status === 'needs_review',
  )

  if (hasAnswered && results.every((result) => result.status === 'answered')) {
    return 'submitted'
  }

  if (hasAnswered || hasNeedsReview) {
    return 'needsReview'
  }

  if (results.every((result) => result.status === 'pending')) {
    return 'unreviewable'
  }

  if (
    results.every(
      (result) =>
        result.status === 'pending' || result.status === 'unreviewable',
    )
  ) {
    return 'unreviewable'
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

  const response = await fetchImplementation('/api/tasks/answer-confirmation', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      taskId: input.taskId,
      formUrls: input.formUrls,
    }),
  })

  if (!response.ok) {
    throw await readAnswerConfirmationError(response)
  }

  const responseBody = (await response.json()) as {
    taskId?: unknown
    results?: unknown
  }

  if (typeof responseBody.taskId !== 'string') {
    throw createAnswerConfirmationError('invalid_backend_response')
  }

  const results = Array.isArray(responseBody.results)
    ? responseBody.results.map((result, index) => {
        const item = result as { formUrl?: unknown; status?: unknown }
        if (typeof item.formUrl !== 'string') {
          throw createAnswerConfirmationError('invalid_backend_response')
        }

        if (
          item.status !== 'answered' &&
          item.status !== 'pending' &&
          item.status !== 'needs_review' &&
          item.status !== 'unreviewable'
        ) {
          throw createAnswerConfirmationError('invalid_backend_response')
        }

        return {
          formUrl: item.formUrl,
          status: item.status,
        } satisfies FormConfirmationResult
      })
    : []

  return {
    taskId: responseBody.taskId,
    formResults: results,
    status: aggregateAnswerConfirmationResults(results),
  }
}

export const mockAnswerConfirmationApi = {
  async checkTaskAnswerConfirmation(
    input: CheckTaskAnswerConfirmationInput,
  ): Promise<CheckTaskAnswerConfirmationResponse> {
    const formResults: FormConfirmationResult[] = input.formUrls.map(
      (formUrl) => {
        const seed = formUrl.split('/').at(-1) ?? formUrl
        const status: FormConfirmationStatus = seed.includes('answered')
          ? 'answered'
          : seed.includes('needs')
            ? 'needs_review'
            : seed.includes('unreviewable')
              ? 'unreviewable'
              : 'pending'

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

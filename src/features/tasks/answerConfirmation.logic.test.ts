import { describe, expect, it, vi } from 'vitest'
import {
  aggregateAnswerConfirmationResults,
  checkTaskAnswerConfirmation,
  createAnswerConfirmationError,
  extractFormId,
  type FormConfirmationResult,
} from './answerConfirmation.api'

describe('answer confirmation aggregation', () => {
  it('marks a single answered form as submitted', () => {
    const results: FormConfirmationResult[] = [
      { formUrl: 'https://forms.google.com/1', status: 'submitted' },
    ]

    expect(aggregateAnswerConfirmationResults(results)).toBe('submitted')
  })

  it('marks a mixed set of form states as needsReview', () => {
    const results: FormConfirmationResult[] = [
      { formUrl: 'https://forms.google.com/1', status: 'submitted' },
      { formUrl: 'https://forms.google.com/2', status: 'needsReview' },
      { formUrl: 'https://forms.google.com/3', status: 'unreviewable' },
    ]

    expect(aggregateAnswerConfirmationResults(results)).toBe('needsReview')
  })

  it('prioritizes needsReview when mixed with unreviewable (Must 3)', () => {
    const results: FormConfirmationResult[] = [
      { formUrl: 'https://forms.google.com/1', status: 'needs_review' },
      { formUrl: 'https://forms.google.com/2', status: 'unreviewable' },
    ]

    expect(aggregateAnswerConfirmationResults(results)).toBe('needsReview')
  })

  it('keeps tasks without forms as unreviewed', () => {
    expect(aggregateAnswerConfirmationResults([])).toBe('unreviewed')
  })

  it('classifies retryable API errors by code', () => {
    expect(createAnswerConfirmationError('permission_denied')).toMatchObject({
      code: 'permission_denied',
    })
    expect(createAnswerConfirmationError('session_expired')).toMatchObject({
      code: 'session_expired',
    })
    expect(createAnswerConfirmationError('temporary_error')).toMatchObject({
      code: 'temporary_error',
    })
  })

  it('extracts formId correctly', () => {
    expect(
      extractFormId('https://docs.google.com/forms/d/form-abc/viewform'),
    ).toBe('viewform')
    expect(extractFormId('https://forms.google.com/form-123')).toBe('form-123')
  })

  it('fetches GET /api/gmail/forms/:formId/response for each form (Must 1 & 2)', async () => {
    const fakeFetch = vi.fn(async (url: string) => {
      if (url.includes('form-1')) {
        return new Response(
          JSON.stringify({ formId: 'form-1', status: 'submitted' }),
          { status: 200 },
        )
      }
      return new Response(
        JSON.stringify({ formId: 'form-2', status: 'needsReview' }),
        { status: 200 },
      )
    })

    const result = await checkTaskAnswerConfirmation(
      {
        taskId: 'task-100',
        formUrls: [
          'https://forms.google.com/form-1',
          'https://forms.google.com/form-2',
        ],
      },
      fakeFetch as unknown as typeof fetch,
    )

    expect(fakeFetch).toHaveBeenCalledTimes(2)
    expect(fakeFetch).toHaveBeenCalledWith(
      '/api/gmail/forms/form-1/response',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(result.status).toBe('needsReview')
  })
})

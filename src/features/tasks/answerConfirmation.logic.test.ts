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

  it('prioritizes needsReview when mixed with unreviewable', () => {
    const results: FormConfirmationResult[] = [
      { formUrl: 'https://forms.google.com/1', status: 'needsReview' },
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

  it.each([
    ['https://docs.google.com/forms/d/form-abc/viewform', 'form-abc'],
    ['https://docs.google.com/forms/d/form-abc/edit', 'form-abc'],
    [
      'https://docs.google.com/forms/d/e/published-abc/viewform',
      'published-abc',
    ],
    [
      'https://docs.google.com/forms/d/form-abc/viewform/?usp=sharing#responses',
      'form-abc',
    ],
    ['https://forms.google.com/forms/d/form-xyz/viewform', 'form-xyz'],
    ['https://forms.google.com/d/form-123/viewform', 'form-123'],
  ])('extracts formId from %s', (formUrl, expectedFormId) => {
    expect(extractFormId(formUrl)).toBe(expectedFormId)
  })

  it.each([
    'https://example.com/form-id',
    'https://forms.google.com/form-id',
    'form-id',
    'not a URL',
  ])('rejects an unknown Form URL without a path-segment fallback', (value) => {
    expect(() => extractFormId(value)).toThrowError(
      expect.objectContaining({ code: 'invalid_form_url', retryable: false }),
    )
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
          'https://forms.google.com/d/e/form-1/viewform',
          'https://forms.google.com/d/e/form-2/viewform',
        ],
      },
      fakeFetch as unknown as typeof fetch,
    )

    expect(fakeFetch).toHaveBeenCalledTimes(2)
    expect(fakeFetch).toHaveBeenCalledWith(
      '/api/gmail/forms/form-1/response?formIdType=published',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(result.status).toBe('needsReview')
  })

  it('passes the published Form ID space to the response endpoint', async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: 'submitted' }), { status: 200 }),
    )

    await checkTaskAnswerConfirmation(
      {
        taskId: 'task-101',
        formUrls: [
          'https://docs.google.com/forms/d/e/published-form/viewform?usp=sharing#x',
        ],
      },
      fakeFetch as unknown as typeof fetch,
    )

    expect(fakeFetch).toHaveBeenNthCalledWith(
      1,
      '/api/gmail/forms/published-form/response?formIdType=published',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('keeps the standard-ID mismatch reason from the backend', async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: 'unreviewable',
            reason: 'standard_id_not_matchable',
          }),
          { status: 200 },
        ),
    )

    const result = await checkTaskAnswerConfirmation(
      {
        taskId: 'task-standard',
        formUrls: ['https://docs.google.com/forms/d/standard-form/viewform'],
      },
      fakeFetch as unknown as typeof fetch,
    )

    expect(result.formResults[0]).toMatchObject({
      status: 'unreviewable',
      reason: 'standard_id_not_matchable',
    })
  })

  it.each(['answered', 'needs_review', 'pending'])(
    'rejects the legacy backend status %s',
    async (status) => {
      const fakeFetch = vi.fn(
        async () => new Response(JSON.stringify({ status }), { status: 200 }),
      )

      await expect(
        checkTaskAnswerConfirmation(
          {
            taskId: 'task-legacy',
            formUrls: [
              'https://docs.google.com/forms/d/e/published-form/viewform',
            ],
          },
          fakeFetch as unknown as typeof fetch,
        ),
      ).rejects.toMatchObject({ code: 'invalid_backend_response' })
    },
  )
})

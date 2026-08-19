import { describe, expect, it } from 'vitest'
import {
  aggregateAnswerConfirmationResults,
  createAnswerConfirmationError,
  type FormConfirmationResult,
} from './answerConfirmation.api'

describe('answer confirmation aggregation', () => {
  it('marks a single answered form as submitted', () => {
    const results: FormConfirmationResult[] = [
      { formUrl: 'https://forms.google.com/1', status: 'answered' },
    ]

    expect(aggregateAnswerConfirmationResults(results)).toBe('submitted')
  })

  it('marks a mixed set of form states as needsReview', () => {
    const results: FormConfirmationResult[] = [
      { formUrl: 'https://forms.google.com/1', status: 'answered' },
      { formUrl: 'https://forms.google.com/2', status: 'needs_review' },
      { formUrl: 'https://forms.google.com/3', status: 'pending' },
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
})

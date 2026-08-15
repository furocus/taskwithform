import { describe, expect, it } from 'vitest'

import {
  MAX_GOOGLE_FORM_ID_LENGTH,
  isValidGoogleFormId,
} from './google-form-id.mjs'

describe('Google Form ID contract', () => {
  it.each(['form-id', 'published-id', '1FAIpQLS_abc-123'])(
    'accepts opaque URL-safe ID %s',
    (formId) => {
      expect(isValidGoogleFormId(formId)).toBe(true)
    },
  )

  it.each(['', 'form id', 'form/id', 'form?id', 'form.id', 'form-id!'])(
    'rejects non-opaque ID %s',
    (formId) => {
      expect(isValidGoogleFormId(formId)).toBe(false)
    },
  )

  it('rejects IDs above the shared maximum', () => {
    expect(isValidGoogleFormId('a'.repeat(MAX_GOOGLE_FORM_ID_LENGTH))).toBe(
      true,
    )
    expect(isValidGoogleFormId('a'.repeat(MAX_GOOGLE_FORM_ID_LENGTH + 1))).toBe(
      false,
    )
  })
})

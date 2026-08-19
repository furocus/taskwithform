const GOOGLE_FORM_ID_PATTERN = /^[A-Za-z0-9_-]+$/
export const MAX_GOOGLE_FORM_ID_LENGTH = 512

export function isValidGoogleFormId(formId) {
  return (
    typeof formId === 'string' &&
    formId.length > 0 &&
    formId.length <= MAX_GOOGLE_FORM_ID_LENGTH &&
    GOOGLE_FORM_ID_PATTERN.test(formId)
  )
}

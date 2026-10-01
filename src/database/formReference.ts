import type { TaskFormReference } from './database.types'

/**
 * The single place that turns a Form reference into a storage key.
 *
 * `/forms/d/{id}/viewform` (standard) and `/forms/d/e/{id}/viewform`
 * (published) are separate ID spaces whose identity is never inferred, so the
 * space is part of the key. Without the prefix, a standard and a published ID
 * that happen to share a string would collide.
 */
export function createFormReferenceKey(reference: TaskFormReference): string {
  if (reference.resolution !== 'resolved') {
    // An unresolved short URL has no Form identity, so there is nothing a
    // confirmation result could be attached to. The next sync either resolves
    // it or removes it.
    throw new Error('An unresolved Form reference has no reference key.')
  }

  return `${reference.formIdType}:${reference.formId}`
}

export interface ParsedFormReferenceKey {
  formIdType: 'standard' | 'published'
  formId: string
}

/** Reverses `createFormReferenceKey`, for looking a stored row back up. */
export function parseFormReferenceKey(
  formReferenceKey: string,
): ParsedFormReferenceKey {
  const separatorIndex = formReferenceKey.indexOf(':')
  const formIdType = formReferenceKey.slice(0, separatorIndex)
  const formId = formReferenceKey.slice(separatorIndex + 1)

  if (
    (formIdType !== 'standard' && formIdType !== 'published') ||
    formId === ''
  ) {
    throw new Error(`Malformed Form reference key: ${formReferenceKey}`)
  }

  return { formIdType, formId }
}

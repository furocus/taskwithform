import type { DateOnly } from '../../database/database.types'

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Reports whether a value is a YYYY-MM-DD date that exists on the calendar.
 * `2026-02-30` and `2026-13-01` are rejected instead of rolling over.
 */
export function isExistingDateOnly(value: unknown): value is DateOnly {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) {
    return false
  }

  const [year, month, day] = value.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const date = new Date(year, month - 1, day)

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

/** Formats a Date as YYYY-MM-DD in the local time zone. */
export function toDateOnly(date: Date): DateOnly {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

type CourseColorTokens = {
  accent: string
  badgeBg: string
  badgeText: string
  border: string
}

const courseColorPresets: CourseColorTokens[] = [
  {
    accent: 'var(--color-tag-c-text)',
    badgeBg: 'var(--color-tag-c-bg)',
    badgeText: 'var(--color-tag-c-text)',
    border: 'var(--color-tag-c-text)',
  },
  {
    accent: 'var(--color-tag-algo-text)',
    badgeBg: 'var(--color-tag-algo-bg)',
    badgeText: 'var(--color-tag-algo-text)',
    border: 'var(--color-tag-algo-text)',
  },
  {
    accent: 'var(--color-tag-ict-text)',
    badgeBg: 'var(--color-tag-ict-bg)',
    badgeText: 'var(--color-tag-ict-text)',
    border: 'var(--color-tag-ict-text)',
  },
]

export const getCourseColors = (courseId?: string): CourseColorTokens => {
  const normalized = (courseId ?? 'default').trim().toLowerCase()

  let hash = 0
  for (const char of normalized) {
    hash = (hash << 5) - hash + char.charCodeAt(0)
    hash |= 0
  }

  const index = Math.abs(hash) % courseColorPresets.length
  return courseColorPresets[index]
}

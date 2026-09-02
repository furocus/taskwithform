export interface CalendarDay {
  date: string
  dayOfMonth: number
  isCurrentMonth: boolean
  isToday: boolean
  dayOfWeek: number
}

const pad = (value: number): string => String(value).padStart(2, '0')

export const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export const getMonthBounds = (
  month: Date,
): { startDate: string; endDate: string } => {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const lastDay = new Date(year, monthIndex + 1, 0)

  return {
    startDate: toDateKey(new Date(year, monthIndex, 1)),
    endDate: toDateKey(lastDay),
  }
}

export const getCalendarDays = (
  month: Date,
  today = new Date(),
): CalendarDay[] => {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const firstDay = new Date(year, monthIndex, 1)
  const gridStart = new Date(year, monthIndex, 1 - firstDay.getDay())
  const days: CalendarDay[] = []

  for (let offset = 0; offset < 42; offset += 1) {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + offset,
    )

    days.push({
      date: toDateKey(date),
      dayOfMonth: date.getDate(),
      isCurrentMonth: date.getMonth() === monthIndex,
      isToday: toDateKey(date) === toDateKey(today),
      dayOfWeek: date.getDay(),
    })
  }

  return days
}

import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

const calendarMock = vi.hoisted(() => ({
  displayedMonth: undefined as { value: Date } | undefined,
}))

vi.mock('../features/calendar/useCalendar', () => ({
  useCalendar: (displayedMonth: { value: Date }) => {
    calendarMock.displayedMonth = displayedMonth
    return {
      status: ref('empty'),
      tasksByDate: ref({}),
      error: ref(null),
      reload: vi.fn(),
    }
  },
}))

import CalendarPage from './CalendarPage.vue'

async function mountCalendar(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/calendar', component: CalendarPage }],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(CalendarPage, { global: { plugins: [router] } })
  await nextTick()
  return { router, wrapper }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('CalendarPage date query', () => {
  it('initializes and watches a valid date query, including same-route changes', async () => {
    const { router, wrapper } = await mountCalendar('/calendar?date=2027-02-14')
    expect(wrapper.text()).toContain('2027年2月')
    expect(calendarMock.displayedMonth?.value).toEqual(new Date(2027, 1, 1))

    await router.push('/calendar?date=2028-03-04')
    await nextTick()
    expect(wrapper.text()).toContain('2028年3月')
    expect(calendarMock.displayedMonth?.value).toEqual(new Date(2028, 2, 1))
  })

  it('falls back to the current month for invalid dates', async () => {
    vi.setSystemTime(new Date(2026, 7, 31, 12))
    const { wrapper } = await mountCalendar('/calendar?date=2026-02-30')

    expect(wrapper.text()).toContain('2026年8月')
    expect(calendarMock.displayedMonth?.value).toEqual(new Date(2026, 7, 1))
  })
})

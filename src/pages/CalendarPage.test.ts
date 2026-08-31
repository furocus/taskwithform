import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CalendarPage from './CalendarPage.vue'

const status = ref<'loading' | 'empty' | 'error' | 'ready'>('ready')
const tasksByDate = ref<
  Record<
    string,
    Array<{
      id: string
      courseId: string
      title: string
    }>
  >
>({
  '2026-08-12': [
    { id: 'task-1', courseId: 'course-1', title: '数学のレポート' },
    { id: 'task-2', courseId: 'course-2', title: '英語の小テスト' },
  ],
})
const reload = vi.fn()

vi.mock('../features/calendar/useCalendar', () => ({
  useCalendar: () => ({ status, tasksByDate, error: ref(null), reload }),
}))

afterEach(() => {
  status.value = 'ready'
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('CalendarPage', () => {
  it('shows the current month and tasks grouped by due date', () => {
    vi.setSystemTime(new Date(2026, 7, 27))
    const wrapper = mount(CalendarPage)

    expect(wrapper.text()).toContain('2026年8月')
    expect(wrapper.text()).toContain('数学のレポート')
    expect(wrapper.text()).toContain('英語の小テスト')
    expect(wrapper.findAll('.calendar-task')).toHaveLength(2)
  })

  it('moves across a year boundary and reloads for the new month', async () => {
    vi.setSystemTime(new Date(2026, 11, 15))
    const wrapper = mount(CalendarPage)

    await wrapper.get('button').trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('2026年11月')

    await wrapper.findAll('button')[1]?.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('2026年12月')

    await wrapper.findAll('button')[1]?.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('2027年1月')
  })

  it('shows loading and error states', async () => {
    status.value = 'loading'
    const wrapper = mount(CalendarPage)
    expect(wrapper.text()).toContain('読み込み中')

    status.value = 'error'
    await nextTick()
    expect(wrapper.text()).toContain('読み込みに失敗しました')
    await wrapper.get('.calendar-error button').trigger('click')
    expect(reload).toHaveBeenCalled()
  })
})

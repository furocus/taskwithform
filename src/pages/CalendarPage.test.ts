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
      externalKey: string
      source: 'google-classroom'
      courseId: string
      courseName: string
      courseWorkId: string
      courseWorkType: 'ASSIGNMENT'
      subjectName: string
      title: string
      formUrls: string[]
      dueDate: string
      status: 'unsubmitted' | 'submitted'
    }>
  >
>({
  '2026-08-12': [
    {
      id: 'task-1',
      externalKey: '["google-classroom","course-c","work-1"]',
      source: 'google-classroom',
      courseId: 'course-c',
      courseName: 'C言語',
      courseWorkId: 'work-1',
      courseWorkType: 'ASSIGNMENT',
      title: 'C言語課題1',
      subjectName: 'C',
      formUrls: [],
      dueDate: '2026-08-12',
      status: 'unsubmitted',
    },
    {
      id: 'task-2',
      externalKey: '["google-classroom","course-algo","work-2"]',
      source: 'google-classroom',
      courseId: 'course-algo',
      courseName: 'アルゴリズム',
      courseWorkId: 'work-2',
      courseWorkType: 'ASSIGNMENT',
      title: 'アルゴリズム問題集',
      subjectName: 'アルゴリズム',
      formUrls: [],
      dueDate: '2026-08-12',
      status: 'unsubmitted',
    },
  ],
  '2026-08-15': [
    {
      id: 'task-3',
      externalKey: '["google-classroom","course-ict","work-3"]',
      source: 'google-classroom',
      courseId: 'course-ict',
      courseName: 'ICT概論',
      courseWorkId: 'work-3',
      courseWorkType: 'ASSIGNMENT',
      title: 'デジタル社会と日本の未来',
      subjectName: 'ICT',
      formUrls: [],
      dueDate: '2026-08-15',
      status: 'unsubmitted',
    },
  ],
})
const reload = vi.fn()

vi.mock('../features/calendar/useCalendar', () => ({
  useCalendar: () => ({ status, tasksByDate, error: ref(null), reload }),
}))

afterEach(() => {
  status.value = 'ready'
  tasksByDate.value = {
    '2026-08-12': [
      {
        id: 'task-1',
        externalKey: '["google-classroom","course-c","work-1"]',
        source: 'google-classroom',
        courseId: 'course-c',
        courseName: 'C言語',
        courseWorkId: 'work-1',
        courseWorkType: 'ASSIGNMENT',
        title: 'C言語課題1',
        subjectName: 'C',
        formUrls: [],
        dueDate: '2026-08-12',
        status: 'unsubmitted',
      },
      {
        id: 'task-2',
        externalKey: '["google-classroom","course-algo","work-2"]',
        source: 'google-classroom',
        courseId: 'course-algo',
        courseName: 'アルゴリズム',
        courseWorkId: 'work-2',
        courseWorkType: 'ASSIGNMENT',
        title: 'アルゴリズム問題集',
        subjectName: 'アルゴリズム',
        formUrls: [],
        dueDate: '2026-08-12',
        status: 'unsubmitted',
      },
    ],
    '2026-08-15': [
      {
        id: 'task-3',
        externalKey: '["google-classroom","course-ict","work-3"]',
        source: 'google-classroom',
        courseId: 'course-ict',
        courseName: 'ICT概論',
        courseWorkId: 'work-3',
        courseWorkType: 'ASSIGNMENT',
        title: 'デジタル社会と日本の未来',
        subjectName: 'ICT',
        formUrls: [],
        dueDate: '2026-08-15',
        status: 'unsubmitted',
      },
    ],
  }
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('CalendarPage', () => {
  describe('課題表示', () => {
    it('提出期限あり・未提出の課題が期限日に表示される', () => {
      vi.setSystemTime(new Date(2026, 7, 27))
      const wrapper = mount(CalendarPage)

      expect(wrapper.text()).toContain('C言語課題1')
      expect(wrapper.text()).toContain('アルゴリズム問題集')
      expect(wrapper.text()).toContain('デジタル社会と日本の未来')
      expect(wrapper.findAll('.calendar-task')).toHaveLength(3)
    })

    it('課題名が正しく表示される', () => {
      vi.setSystemTime(new Date(2026, 7, 27))
      const wrapper = mount(CalendarPage)

      expect(wrapper.text()).toContain('C言語課題1')
      expect(wrapper.text()).toContain('アルゴリズム問題集')
    })

    it('課題の色が正しく反映される', () => {
      vi.setSystemTime(new Date(2026, 7, 27))
      const wrapper = mount(CalendarPage)

      const taskElements = wrapper.findAll('.calendar-task')
      expect(taskElements.length).toBeGreaterThan(0)

      // 各要素がborder-left-colorスタイルを持つことを確認
      taskElements.forEach((element) => {
        const style = element.attributes('style')
        expect(style).toMatch(/border-left-color/)
      })
    })

    it('科目バッジが表示される', () => {
      vi.setSystemTime(new Date(2026, 7, 27))
      const wrapper = mount(CalendarPage)

      const badges = wrapper.findAll('.calendar-task-badge')
      expect(badges.length).toBeGreaterThan(0)
      expect(wrapper.text()).toContain('C')
      expect(wrapper.text()).toContain('アルゴリズム')
      expect(wrapper.text()).toContain('ICT')
    })

    it('同じ日に複数の課題を表示できる', () => {
      vi.setSystemTime(new Date(2026, 7, 27))
      const wrapper = mount(CalendarPage)

      // 2026-08-12は2つの課題を持つ
      const tasksInCell = wrapper.findAll('.calendar-task-item')
      expect(tasksInCell.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('月移動', () => {
    it('前月へ移動できる', async () => {
      vi.setSystemTime(new Date(2026, 7, 27))
      const wrapper = mount(CalendarPage)

      // 最初は8月
      expect(wrapper.text()).toContain('2026年8月')

      // 前の月ボタンをクリック（最初のカレンダーボタン）
      const calendarButtons = wrapper.findAll('button.calendar-nav-button')
      await calendarButtons[0].trigger('click')
      await nextTick()

      // 7月に移動
      expect(wrapper.text()).toContain('2026年7月')
    })

    it('翌月へ移動できる', async () => {
      vi.setSystemTime(new Date(2026, 7, 27))
      const wrapper = mount(CalendarPage)

      // 最初は8月
      expect(wrapper.text()).toContain('2026年8月')

      // 次の月ボタンをクリック（最後のカレンダーボタン）
      const calendarButtons = wrapper.findAll('button.calendar-nav-button')
      await calendarButtons[1].trigger('click')
      await nextTick()

      // 9月に移動
      expect(wrapper.text()).toContain('2026年9月')
    })

    it('月移動後、その月の課題だけが表示される', async () => {
      vi.setSystemTime(new Date(2026, 7, 27))
      const wrapper = mount(CalendarPage)

      // 8月の課題が表示されている
      expect(wrapper.text()).toContain('C言語課題1')

      // 9月に移動するとtasksByDateが空になる
      tasksByDate.value = {}
      status.value = 'empty'
      const calendarButtons = wrapper.findAll('button.calendar-nav-button')
      await calendarButtons[1].trigger('click')
      await nextTick()

      // エラーまたは空状態メッセージが表示される
      expect(
        wrapper.text().includes('読み込み中') ||
          wrapper.text().includes('未提出課題はありません'),
      ).toBe(true)
    })

    it('年をまたぐ月移動が正しく動作する', async () => {
      vi.setSystemTime(new Date(2026, 11, 15))
      const wrapper = mount(CalendarPage)

      expect(wrapper.text()).toContain('2026年12月')

      // 翌月へ移動
      const calendarButtons = wrapper.findAll('button.calendar-nav-button')
      await calendarButtons[1].trigger('click')
      await nextTick()

      // 2027年1月に移動
      expect(wrapper.text()).toContain('2027年1月')
    })
  })

  describe('状態管理', () => {
    it('Loading状態を確認できる', () => {
      status.value = 'loading'
      vi.setSystemTime(new Date(2026, 7, 27))
      const wrapper = mount(CalendarPage)

      expect(wrapper.text()).toContain('読み込み中')
    })

    it('課題がない月でもカレンダーが正常に表示される', () => {
      status.value = 'empty'
      tasksByDate.value = {}
      vi.setSystemTime(new Date(2026, 7, 27))
      const wrapper = mount(CalendarPage)

      expect(wrapper.text()).toContain('2026年8月')
      expect(wrapper.text()).toContain('未提出課題はありません')
      // カレンダーグリッドは表示されている
      expect(wrapper.find('.calendar-grid').exists()).toBe(true)
    })

    it('Error状態を確認できる', async () => {
      status.value = 'error'
      vi.setSystemTime(new Date(2026, 7, 27))
      const wrapper = mount(CalendarPage)

      expect(wrapper.text()).toContain('読み込みに失敗しました')

      const retryButton = wrapper.find('.calendar-error button')
      expect(retryButton.exists()).toBe(true)

      await retryButton.trigger('click')
      expect(reload).toHaveBeenCalled()
    })
  })

  describe('月間カレンダー基本機能', () => {
    it('月のラベルが正しく表示される', () => {
      vi.setSystemTime(new Date(2026, 7, 27))
      const wrapper = mount(CalendarPage)

      expect(wrapper.text()).toContain('2026年8月')
    })

    it('曜日ヘッダーが表示される', () => {
      vi.setSystemTime(new Date(2026, 7, 27))
      const wrapper = mount(CalendarPage)

      const weekdayElements = wrapper.find('.calendar-weekdays')
      expect(weekdayElements.exists()).toBe(true)
      expect(weekdayElements.text()).toContain('日')
      expect(weekdayElements.text()).toContain('月')
      expect(weekdayElements.text()).toContain('土')
    })

    it('カレンダーグリッドが7列で構成されている', () => {
      vi.setSystemTime(new Date(2026, 7, 27))
      const wrapper = mount(CalendarPage)

      const grid = wrapper.find('.calendar-grid')
      expect(grid.exists()).toBe(true)
      // 7列 × 6週 = 42セル
      const days = wrapper.findAll('.calendar-day')
      expect(days.length).toBe(42)
    })
  })
})

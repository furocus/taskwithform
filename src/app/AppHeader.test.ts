import { mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskRecord } from '../database/database.types'

const notificationMocks = vi.hoisted(() => {
  return {
    notifications: [] as TaskRecord[],
    status: 'empty' as 'loading' | 'empty' | 'ready' | 'error',
    badgeLabel: '',
    date: '2026-08-31',
    reload: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('../features/notifications/useDeadlineNotifications', () => ({
  useDeadlineNotifications: () => ({
    get status() {
      return notificationMocks.status
    },
    get notifications() {
      return notificationMocks.notifications
    },
    error: null,
    count: 0,
    get badgeLabel() {
      return notificationMocks.badgeLabel
    },
    get date() {
      return notificationMocks.date
    },
    reload: notificationMocks.reload,
  }),
}))

import AppHeader from './AppHeader.vue'

function createTask(id: string): TaskRecord {
  return {
    id,
    externalKey: JSON.stringify(['google-classroom', 'course-1', id]),
    source: 'google-classroom',
    courseId: 'course-1',
    courseName: '数学I',
    courseWorkId: id,
    courseWorkType: 'ASSIGNMENT',
    subjectName: '数学I',
    title: `課題${id}`,
    formUrls: [],
    dueDate: '2026-08-31',
    status: 'unsubmitted',
  }
}

async function createTestRouter(): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'main', component: { template: '<div />' } },
      {
        path: '/calendar',
        name: 'calendar',
        component: { template: '<div />' },
      },
    ],
  })
  await router.push('/')
  await router.isReady()
  return router
}

describe('AppHeader notifications', () => {
  const mountedWrappers: VueWrapper[] = []

  afterEach(() => {
    mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  })

  beforeEach(() => {
    notificationMocks.notifications = []
    notificationMocks.status = 'empty'
    notificationMocks.badgeLabel = ''
    notificationMocks.date = '2026-08-31'
    notificationMocks.reload.mockClear()
  })

  it('hides a zero badge and exposes bell expanded state', async () => {
    const router = await createTestRouter()
    const wrapper = mount(AppHeader, {
      attachTo: document.body,
      global: { plugins: [router] },
    })
    mountedWrappers.push(wrapper)
    const bell = wrapper.get('button[aria-label="通知"]')

    expect(wrapper.find('[data-test="notification-badge"]').exists()).toBe(
      false,
    )
    expect(bell.attributes('aria-expanded')).toBe('false')
    expect(bell.attributes('aria-controls')).toBe('notification-popover')

    await bell.trigger('click')
    await nextTick()
    expect(bell.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('#notification-popover').exists()).toBe(true)
    expect(document.activeElement).toBe(
      wrapper.get('#notification-popover').element,
    )
  })

  it('shows 9+ and closes on Escape or an outside click', async () => {
    notificationMocks.notifications = Array.from({ length: 10 }, (_, i) =>
      createTask(String(i)),
    )
    notificationMocks.status = 'ready'
    notificationMocks.badgeLabel = '9+'
    const router = await createTestRouter()
    const wrapper = mount(AppHeader, {
      attachTo: document.body,
      global: { plugins: [router] },
    })
    mountedWrappers.push(wrapper)
    const bell = wrapper.get('button[aria-label="通知"]')

    expect(wrapper.get('[data-test="notification-badge"]').text()).toBe('9+')
    await bell.trigger('click')
    await nextTick()
    expect(wrapper.find('#notification-popover').exists()).toBe(true)
    expect(document.activeElement).toBe(
      wrapper.get('.notification-item').element,
    )

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.find('#notification-popover').exists()).toBe(false)
    expect(bell.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(bell.element)

    await bell.trigger('click')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(wrapper.find('#notification-popover').exists()).toBe(false)
  })
})

import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { TaskRecord } from '../../../database/database.types'
import { useDeadlineNotifications } from '../useDeadlineNotifications'
import NotificationPopover from './NotificationPopover.vue'

function createTask(id: string, dueDate = '2026-08-31'): TaskRecord {
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
    dueDate,
    status: 'unsubmitted',
  }
}

async function createTestRouter(): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/calendar', component: { template: '<div />' } }],
  })
  await router.push('/calendar')
  await router.isReady()
  return router
}

describe('NotificationPopover', () => {
  it('shows at most five tasks and the remaining count', async () => {
    const router = await createTestRouter()
    const wrapper = mount(NotificationPopover, {
      props: {
        status: 'ready',
        notifications: Array.from({ length: 7 }, (_, index) =>
          createTask(String(index + 1)),
        ),
        date: '2026-08-31',
        reload: vi.fn(),
      },
      global: { plugins: [router] },
    })

    expect(wrapper.findAll('.notification-item')).toHaveLength(5)
    expect(wrapper.text()).toContain('ほか2件')
    expect(wrapper.text()).toContain('今日が期限')
  })

  it('navigates to the task date and emits close on item click', async () => {
    const router = await createTestRouter()
    const wrapper = mount(NotificationPopover, {
      props: {
        status: 'ready',
        notifications: [createTask('one')],
        date: '2026-08-31',
        reload: vi.fn(),
      },
      global: { plugins: [router] },
    })

    await wrapper.get('.notification-item').trigger('click')
    await vi.waitFor(() =>
      expect(router.currentRoute.value.fullPath).toBe(
        '/calendar?date=2026-08-31',
      ),
    )

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('renders loading, empty, and retryable error states', async () => {
    const router = await createTestRouter()
    const reload = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(NotificationPopover, {
      props: {
        status: 'loading',
        notifications: [],
        date: '2026-08-31',
        reload,
      },
      global: { plugins: [router] },
    })
    expect(wrapper.text()).toContain('読み込み中')

    await wrapper.setProps({ status: 'empty' })
    expect(wrapper.text()).toContain('今日が期限の課題はありません')

    await wrapper.setProps({ status: 'error' })
    expect(wrapper.text()).toContain('通知の読み込みに失敗しました')
    await wrapper.get('.notification-retry').trigger('click')
    expect(reload).toHaveBeenCalledOnce()
  })

  it('uses the date refreshed by a midnight retry for calendar navigation', async () => {
    let current = new Date(2026, 7, 31, 23, 59)
    const repository = {
      getUnsubmittedTasksInDateRange: vi
        .fn()
        .mockResolvedValueOnce([createTask('august')])
        .mockResolvedValueOnce([createTask('september', '2026-09-01')]),
    }
    let result: ReturnType<typeof useDeadlineNotifications> | undefined
    const Harness = defineComponent({
      setup() {
        result = useDeadlineNotifications({
          repository,
          now: () => current,
        })
        return () =>
          h(NotificationPopover, {
            status: result!.status.value,
            notifications: result!.notifications.value,
            date: result!.date.value,
            reload: result!.reload,
          })
      },
    })
    const router = await createTestRouter()
    const wrapper = mount(Harness, { global: { plugins: [router] } })
    await vi.waitFor(() => expect(result?.status.value).toBe('ready'))

    current = new Date(2026, 8, 1, 0, 1)
    await result!.reload()
    await vi.waitFor(() => expect(result?.date.value).toBe('2026-09-01'))
    await wrapper.get('.notification-view-all').trigger('click')
    await vi.waitFor(() =>
      expect(router.currentRoute.value.fullPath).toBe(
        '/calendar?date=2026-09-01',
      ),
    )
  })
})

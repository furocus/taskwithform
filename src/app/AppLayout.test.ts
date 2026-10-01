import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { TaskRepository } from '../database/task.repository'
import {
  useProvidedTaskSyncContext,
  type TaskSyncContext,
} from '../features/tasks/taskSyncContext'
import AppLayout from './AppLayout.vue'

describe('AppLayout task sync provider', () => {
  it('starts one shared sync for multiple descendants', async () => {
    const sync = vi.fn().mockResolvedValue({
      syncedCourseIds: ['course-1'],
      syncedTaskCount: 1,
    })
    const repository = {} as TaskRepository
    const contexts: Array<TaskSyncContext | undefined> = []
    const Consumer = defineComponent({
      setup() {
        const context = useProvidedTaskSyncContext()
        contexts.push(context)
        return () => h('span')
      },
    })
    const Descendants = defineComponent({
      setup() {
        return () => h('div', [h(Consumer), h(Consumer)])
      },
    })

    const wrapper = mount(AppLayout, {
      props: {
        repository,
        sync,
      },
      global: {
        stubs: {
          AppHeader: true,
          RouterView: Descendants,
        },
      },
    })

    await vi.waitFor(() => expect(sync).toHaveBeenCalledOnce())

    expect(contexts).toHaveLength(2)
    expect(contexts[0]).toBeDefined()
    expect(contexts[0]).toBe(contexts[1])
    expect(contexts[0]?.repository).toBe(repository)
    expect(contexts[0]?.revision.value).toBe(1)

    wrapper.unmount()
  })
})

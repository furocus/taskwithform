import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TaskList from './TaskList.vue'
import type { Task } from '../task.types'

const sampleTasks: Task[] = [
  {
    id: 1,
    index: 1,
    title: 'C言語レポート',
    subject: 'C言語',
    dueDate: '2026-08-05',
    warning: '2日後',
    answerStatus: 'unreviewed',
  },
]

describe('TaskList', () => {
  it('renders loading state', () => {
    const wrapper = mount(TaskList, {
      props: {
        status: 'loading',
        tasks: [],
      },
    })

    expect(wrapper.text()).toContain('読み込み中')
  })

  it('renders empty state', () => {
    const wrapper = mount(TaskList, {
      props: {
        status: 'empty',
        tasks: [],
      },
    })

    expect(wrapper.text()).toContain('課題はまだありません')
  })

  it('renders error state and triggers retry callback', async () => {
    const onRetry = vi.fn()
    const wrapper = mount(TaskList, {
      props: {
        status: 'error',
        tasks: [],
        onRetry,
      },
    })

    await wrapper.get('button').trigger('click')
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders ready state with tasks and stable course colors based on courseId', () => {
    const wrapper = mount(TaskList, {
      props: {
        status: 'ready',
        tasks: sampleTasks,
        courseId: 'course-a',
      },
    })

    expect(wrapper.text()).toContain('C言語レポート')
    const accent = wrapper.get('.task-list-accent').attributes('style')
    expect(accent).toContain('background-color')
  })

  it('recomputes course colors when courseId changes', async () => {
    const wrapper = mount(TaskList, {
      props: {
        status: 'ready',
        tasks: sampleTasks,
        courseId: 'course-a',
      },
    })

    const initialAccent = wrapper.get('.task-list-accent').attributes('style')
    await wrapper.setProps({ courseId: 'course-b' })
    const updatedAccent = wrapper.get('.task-list-accent').attributes('style')

    expect(initialAccent).not.toEqual(updatedAccent)
  })

  it('does not show sync message during loading or error states', () => {
    const loadingWrapper = mount(TaskList, {
      props: {
        status: 'loading',
        tasks: [],
      },
    })
    expect(loadingWrapper.text()).not.toContain('同期済み')

    const errorWrapper = mount(TaskList, {
      props: {
        status: 'error',
        tasks: [],
      },
    })
    expect(errorWrapper.text()).not.toContain('同期済み')
  })

  it('calls the task click callback when a task card is clicked', async () => {
    const onTaskClick = vi.fn()
    const wrapper = mount(TaskList, {
      props: {
        status: 'ready',
        tasks: sampleTasks,
        onTaskClick,
      },
    })

    await wrapper.get('article[role="button"]').trigger('click')

    expect(onTaskClick).toHaveBeenCalledWith('1')
  })
})

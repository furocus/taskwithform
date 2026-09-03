import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TaskCard from './TaskCard.vue'
import type { Task } from '../task.types'

const sampleTask: Task = {
  id: 'task-1',
  index: 1,
  title: '長い課題タイトルでも崩れないUIを確認するテスト',
  subject: '情報技術',
  courseId: 'course-a',
  dueDate: '2026-08-05',
  warning: '2日後',
  answerStatus: 'reviewing',
}

describe('TaskCard', () => {
  it('renders the answer status badge and task content', () => {
    const wrapper = mount(TaskCard, {
      props: {
        task: sampleTask,
      },
    })

    expect(wrapper.text()).toContain('確認中')
    expect(wrapper.text()).toContain(
      '長い課題タイトルでも崩れないUIを確認するテスト',
    )
  })

  it('calls onTaskClick when clicked', async () => {
    const onTaskClick = vi.fn()
    const wrapper = mount(TaskCard, {
      props: {
        task: sampleTask,
        onTaskClick,
      },
    })

    await wrapper.get('article[role="button"]').trigger('click')
    expect(onTaskClick).toHaveBeenCalledWith('task-1')
  })

  it('does not expose button semantics when onTaskClick is not provided', () => {
    const taskWithoutCallback: Task = {
      ...sampleTask,
      answerStatus: 'unreviewed',
    }
    const wrapper = mount(TaskCard, {
      props: {
        task: taskWithoutCallback,
      },
    })

    expect(wrapper.find('article').attributes('role')).toBeUndefined()
    expect(wrapper.find('article').attributes('tabindex')).toBeUndefined()
    expect(wrapper.find('article').classes()).not.toContain('cursor-pointer')
  })

  it('shows a confirmation button only for form-attached tasks and disables it while checking', async () => {
    const onConfirmAnswer = vi.fn()
    const wrapper = mount(TaskCard, {
      props: {
        task: {
          ...sampleTask,
          formUrls: ['https://forms.google.com/abc'],
        },
        onConfirmAnswer,
        isConfirming: true,
      },
    })

    const button = wrapper.get('button[data-test="confirm-answer"]')
    expect(button.attributes('disabled')).toBe('')
    expect(button.text()).toContain('確認中')

    await button.trigger('click')
    expect(onConfirmAnswer).not.toHaveBeenCalled()

    const noFormWrapper = mount(TaskCard, {
      props: {
        task: {
          ...sampleTask,
          formUrls: [],
        },
        onConfirmAnswer,
      },
    })

    expect(noFormWrapper.find('[data-test="confirm-answer"]').exists()).toBe(
      false,
    )
  })

  it('shows the distribution title, Form title, and source label for a resolved Form', () => {
    const wrapper = mount(TaskCard, {
      props: {
        task: {
          ...sampleTask,
          title: '配布タイトル',
          formTitle: '回答フォーム',
          sourceLabel: '資料',
          form: {
            resolution: 'resolved',
            sourceUrl: 'https://forms.gle/example',
            formId: 'form-id',
            formUrl: 'https://docs.google.com/forms/d/form-id/viewform',
            title: '回答フォーム',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('配布タイトル')
    expect(wrapper.text()).toContain('回答フォーム')
    expect(wrapper.text()).toContain('資料')
    expect(wrapper.get('[data-test="confirm-answer"]').text()).toContain(
      '回答を確認',
    )
  })

  it('shows an unresolved Form message and retries the Classroom sync without a confirmation button', async () => {
    const onRetry = vi.fn()
    const wrapper = mount(TaskCard, {
      props: {
        task: {
          ...sampleTask,
          form: {
            resolution: 'unresolved',
            sourceUrl: 'https://forms.gle/broken',
          },
        },
        onRetry,
        onConfirmAnswer: vi.fn(),
      },
    })

    expect(wrapper.text()).toContain('Formリンクを確認できません')
    expect(wrapper.text()).toContain('リンクを再確認')
    expect(wrapper.find('[data-test="confirm-answer"]').exists()).toBe(false)
    await wrapper.get('[data-test="retry-form-link"]').trigger('click')
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

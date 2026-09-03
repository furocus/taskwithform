import { mount } from '@vue/test-utils'
import { nextTick, ref, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Task } from '../features/tasks/task.types'

const mocks = vi.hoisted(() => ({
  useTasks: vi.fn(),
  checkTaskAnswerConfirmation: vi.fn(),
}))

vi.mock('../features/tasks/useTasks', () => ({
  useTasks: mocks.useTasks,
}))

vi.mock('../features/tasks/answerConfirmation.api', () => ({
  checkTaskAnswerConfirmation: mocks.checkTaskAnswerConfirmation,
}))

import MainPage from './MainPage.vue'

function createTask(): Task {
  return {
    id: 'task-uuid-1',
    index: 1,
    title: '確認テスト',
    subject: '数学I',
    courseId: 'course-1',
    dueDate: '9月4日',
    warning: 'あと4日',
    answerStatus: 'unreviewed',
    formUrls: ['https://docs.google.com/forms/d/form-id/viewform'],
  }
}

describe('MainPage', () => {
  let status: Ref<'loading' | 'empty' | 'error' | 'ready'>
  let tasks: Ref<Task[]>
  let updateTaskAnswerStatus: ReturnType<typeof vi.fn>

  beforeEach(() => {
    status = ref('ready')
    tasks = ref([createTask()])
    updateTaskAnswerStatus = vi.fn(
      (taskId: string, answerStatus: Task['answerStatus']) => {
        tasks.value = tasks.value.map((task) =>
          task.id === taskId ? { ...task, answerStatus } : task,
        )
      },
    )
    mocks.useTasks.mockReturnValue({
      status,
      tasks,
      courseId: ref('course-1'),
      reload: vi.fn(),
      error: ref(null),
      updateTaskAnswerStatus,
    })
    mocks.checkTaskAnswerConfirmation.mockResolvedValue({
      taskId: 'task-uuid-1',
      formResults: [],
      status: 'submitted',
    })
  })

  it('renders useTasks data and updates the target task after answer confirmation', async () => {
    const wrapper = mount(MainPage, {
      global: {
        stubs: { ClassroomConnectionPanel: true },
      },
    })

    expect(wrapper.text()).toContain('確認テスト')
    await wrapper.get('button[data-test="confirm-answer"]').trigger('click')
    await nextTick()

    expect(mocks.checkTaskAnswerConfirmation).toHaveBeenCalledWith({
      taskId: 'task-uuid-1',
      formUrls: ['https://docs.google.com/forms/d/form-id/viewform'],
    })
    expect(updateTaskAnswerStatus).toHaveBeenCalledWith(
      'task-uuid-1',
      'submitted',
    )
    expect(wrapper.text()).toContain('回答済み')
  })
})

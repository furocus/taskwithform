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

  it('confirms one resolved Form and propagates its result to every matching card', async () => {
    const matchingTasks = ref<Task[]>([
      {
        ...createTask(),
        id: 'task-1',
        form: {
          resolution: 'resolved',
          sourceUrl: 'https://docs.google.com/forms/d/same/viewform',
          formId: 'same',
          formUrl: 'https://docs.google.com/forms/d/same/viewform',
          title: '同じフォーム',
        },
        formTitle: '同じフォーム',
        sourceLabel: '課題',
      },
      {
        ...createTask(),
        id: 'task-2',
        form: {
          resolution: 'resolved',
          sourceUrl: 'https://docs.google.com/forms/d/same/viewform',
          formId: 'same',
          formUrl: 'https://docs.google.com/forms/d/same/viewform',
          title: '同じフォーム',
        },
        formTitle: '同じフォーム',
        sourceLabel: '資料',
      },
    ])
    const updateTasksAnswerStatusByFormId = vi.fn((formId, status) => {
      matchingTasks.value = matchingTasks.value.map((task) =>
        task.form?.resolution === 'resolved' && task.form.formId === formId
          ? { ...task, answerStatus: status }
          : task,
      )
    })
    mocks.useTasks.mockReturnValue({
      status: ref('ready'),
      tasks: matchingTasks,
      courseId: ref('course-1'),
      reload: vi.fn(),
      error: ref(null),
      updateTaskAnswerStatus: vi.fn(),
      updateTasksAnswerStatusByFormId,
    })
    mocks.checkTaskAnswerConfirmation.mockResolvedValue({
      taskId: 'task-1',
      formResults: [
        {
          formUrl: 'https://docs.google.com/forms/d/same/viewform',
          status: 'submitted',
        },
      ],
      status: 'submitted',
    })

    const wrapper = mount(MainPage, {
      global: { stubs: { ClassroomConnectionPanel: true } },
    })
    await wrapper
      .findAll('button[data-test="confirm-answer"]')[0]!
      .trigger('click')
    await nextTick()

    expect(mocks.checkTaskAnswerConfirmation).toHaveBeenCalledWith({
      taskId: 'task-1',
      formUrls: ['https://docs.google.com/forms/d/same/viewform'],
    })
    expect(updateTasksAnswerStatusByFormId).toHaveBeenCalledWith(
      'same',
      'submitted',
    )
    expect(
      wrapper
        .findAll('.answer-status-badge')
        .every((badge) => badge.text().includes('回答済み')),
    ).toBe(true)
  })

  it('does not call Gmail for unresolved Forms and retries the full Classroom reload', async () => {
    const reload = vi.fn()
    mocks.checkTaskAnswerConfirmation.mockClear()
    mocks.useTasks.mockReturnValue({
      status: ref('ready'),
      tasks: ref([
        {
          ...createTask(),
          formUrls: [],
          form: {
            resolution: 'unresolved',
            sourceUrl: 'https://forms.gle/broken',
          },
        },
      ]),
      courseId: ref('course-1'),
      reload,
      error: ref(null),
      updateTaskAnswerStatus: vi.fn(),
      updateTasksAnswerStatusByFormId: vi.fn(),
    })

    const wrapper = mount(MainPage, {
      global: { stubs: { ClassroomConnectionPanel: true } },
    })
    expect(wrapper.find('[data-test="confirm-answer"]').exists()).toBe(false)
    await wrapper.get('[data-test="retry-form-link"]').trigger('click')

    expect(reload).toHaveBeenCalledOnce()
    expect(mocks.checkTaskAnswerConfirmation).not.toHaveBeenCalled()
  })

  it('shows a re-authentication action when Classroom scopes are missing', async () => {
    mocks.useTasks.mockReturnValue({
      status: ref('error'),
      tasks: ref([]),
      courseId: ref('course-1'),
      reload: vi.fn(),
      error: ref({ code: 'classroom_scope_missing' }),
      updateTaskAnswerStatus: vi.fn(),
      updateTasksAnswerStatusByFormId: vi.fn(),
    })

    const wrapper = mount(MainPage, {
      global: { stubs: { ClassroomConnectionPanel: true } },
    })
    expect(wrapper.text()).toContain('追加権限が必要')
    expect(wrapper.get('[data-test="reauthenticate"]').attributes('href')).toBe(
      '/api/auth/google',
    )
  })
})

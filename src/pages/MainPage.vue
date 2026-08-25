<script setup lang="ts">
import { reactive, ref } from 'vue'
import ClassroomConnectionPanel from '../features/auth/components/ClassroomConnectionPanel.vue'
import { checkTaskAnswerConfirmation } from '../features/tasks/answerConfirmation.api'
import type { Task } from '../features/tasks/task.types'
import TaskList from '../features/tasks/components/TaskList.vue'
import { mockTasks } from '../mocks/tasks'

type TaskListState = {
  status: 'loading' | 'empty' | 'error' | 'ready'
  tasks: Task[]
  courseId: string
}

type TaskConfirmationError = {
  code: string
  retryable?: boolean
}

const taskListState = reactive<TaskListState>({
  status: 'ready',
  tasks: mockTasks,
  courseId: 'course-a',
})
const confirmingTaskId = ref<number | null>(null)
const confirmationErrors = reactive<
  Record<number, TaskConfirmationError | null>
>({})

const handleRetry = () => {
  taskListState.status = 'loading'

  window.setTimeout(() => {
    taskListState.status = 'ready'
    taskListState.tasks = mockTasks
  }, 300)
}

const handleConfirmAnswer = async (taskId: number) => {
  const task = taskListState.tasks.find((item) => item.id === taskId)
  if (!task || !task.formUrls || task.formUrls.length === 0) {
    return
  }

  if (confirmingTaskId.value !== null) {
    return
  }

  confirmingTaskId.value = taskId
  confirmationErrors[taskId] = null

  try {
    const result = await checkTaskAnswerConfirmation({
      taskId: String(taskId),
      formUrls: task.formUrls,
    })

    taskListState.tasks = taskListState.tasks.map((item) =>
      item.id === taskId ? { ...item, answerStatus: result.status } : item,
    )
  } catch (error) {
    const confirmationError = error as { code?: string; retryable?: boolean }
    confirmationErrors[taskId] = {
      code: confirmationError.code ?? 'temporary_error',
      retryable: confirmationError.retryable ?? true,
    }
  } finally {
    if (confirmingTaskId.value === taskId) {
      confirmingTaskId.value = null
    }
  }
}
</script>

<template>
  <section class="space-y-5">
    <TaskList
      :status="taskListState.status"
      :tasks="taskListState.tasks"
      :course-id="taskListState.courseId"
      :on-retry="handleRetry"
      :on-confirm-answer="handleConfirmAnswer"
      :confirming-task-id="confirmingTaskId"
      :confirmation-errors="confirmationErrors"
    />
    <ClassroomConnectionPanel />
  </section>
</template>

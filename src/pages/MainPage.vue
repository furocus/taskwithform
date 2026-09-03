<script setup lang="ts">
import { reactive, ref } from 'vue'
import ClassroomConnectionPanel from '../features/auth/components/ClassroomConnectionPanel.vue'
import { checkTaskAnswerConfirmation } from '../features/tasks/answerConfirmation.api'
import TaskList from '../features/tasks/components/TaskList.vue'
import { useTasks } from '../features/tasks/useTasks'

type TaskConfirmationError = {
  code: string
  retryable?: boolean
}

const { status, tasks, courseId, reload, updateTaskAnswerStatus } = useTasks()
const confirmingTaskId = ref<string | null>(null)
const confirmationErrors = reactive<
  Record<string, TaskConfirmationError | null>
>({})

const handleConfirmAnswer = async (taskId: string) => {
  const task = tasks.value.find((item) => item.id === taskId)
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
      taskId,
      formUrls: task.formUrls,
    })

    updateTaskAnswerStatus(taskId, result.status)
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
      :status="status"
      :tasks="tasks"
      :course-id="courseId"
      :on-retry="reload"
      :on-confirm-answer="handleConfirmAnswer"
      :confirming-task-id="confirmingTaskId"
      :confirmation-errors="confirmationErrors"
    />
    <ClassroomConnectionPanel />
  </section>
</template>

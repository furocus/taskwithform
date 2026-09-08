<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import ClassroomConnectionPanel from '../features/auth/components/ClassroomConnectionPanel.vue'
import { checkTaskAnswerConfirmation } from '../features/tasks/answerConfirmation.api'
import TaskList from '../features/tasks/components/TaskList.vue'
import { useTasks } from '../features/tasks/useTasks'

type TaskConfirmationError = {
  code: string
  retryable?: boolean
}

const {
  status,
  tasks,
  courseId,
  error,
  updateTaskAnswerStatus,
  reload,
  updateTasksAnswerStatusByFormId,
} = useTasks()
const needsReauthentication = computed(
  () =>
    (error.value as { code?: unknown } | null)?.code ===
    'classroom_scope_missing',
)
const confirmingTaskId = ref<string | null>(null)
const confirmationErrors = reactive<
  Record<string, TaskConfirmationError | null>
>({})

const handleConfirmAnswer = async (taskId: string) => {
  const task = tasks.value.find((item) => item.id === taskId)
  const legacyFormUrl = task?.formUrls?.[0]
  const form =
    task?.form?.resolution === 'resolved'
      ? task.form
      : legacyFormUrl === undefined
        ? undefined
        : {
            resolution: 'resolved' as const,
            sourceUrl: legacyFormUrl,
            formId: (() => {
              try {
                const segments = new URL(legacyFormUrl).pathname
                  .split('/')
                  .filter(Boolean)
                return segments.at(-1) === 'viewform' ||
                  segments.at(-1) === 'edit'
                  ? (segments.at(-2) ?? legacyFormUrl)
                  : (segments.at(-1) ?? legacyFormUrl)
              } catch {
                return (
                  legacyFormUrl.split('/').filter(Boolean).at(-1) ??
                  legacyFormUrl
                )
              }
            })(),
            formUrl: legacyFormUrl,
          }
  if (!task || form === undefined || !form.formUrl || !form.formId) {
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
      formUrls: [form.formUrl],
    })

    if (updateTasksAnswerStatusByFormId !== undefined) {
      updateTasksAnswerStatusByFormId(form.formId, result.status)
    } else {
      updateTaskAnswerStatus?.(taskId, result.status)
    }
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
    <div
      v-if="needsReauthentication"
      role="alert"
      class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
    >
      Classroomの追加権限が必要です。Googleに再ログインして権限を許可してください。
      <a
        data-test="reauthenticate"
        href="/api/auth/google"
        class="ml-2 font-semibold underline"
      >
        再ログイン
      </a>
    </div>
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

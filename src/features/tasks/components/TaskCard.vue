<script setup lang="ts">
import type { Task } from '../task.types'
import { computed } from 'vue'
import { getCourseColors } from '../task.utils'
import AnswerStatusBadge from './AnswerStatusBadge.vue'

interface ConfirmationErrorLike {
  code: string
  retryable?: boolean
}

const props = defineProps<{
  task: Task
  onTaskClick?: (taskId: string) => void
  onConfirmAnswer?: (taskId: string) => void
  onRetry?: () => void
  isConfirming?: boolean
  confirmationError?: ConfirmationErrorLike | null
}>()

const courseColors = computed(() => getCourseColors(props.task.courseId))
const isInteractive = computed(() => Boolean(props.onTaskClick))
const answerStatus = computed(() => props.task.answerStatus ?? 'unreviewed')
const hasResolvedForm = computed(
  () =>
    props.task.form?.resolution === 'resolved' ||
    (props.task.form === undefined && (props.task.formUrls ?? []).length > 0),
)
const hasUnresolvedForm = computed(
  () => props.task.form?.resolution === 'unresolved',
)
const isConfirmDisabled = computed(
  () => Boolean(props.isConfirming) || !hasResolvedForm.value,
)

const confirmationMessage = computed(() => {
  if (!props.confirmationError) return ''

  const messages: Record<string, string> = {
    permission_denied: 'Gmail権限が不足しています。',
    session_expired: 'セッションが切れました。再度ログインしてください。',
    temporary_error: '一時的な障害が発生しました。再試行してください。',
    invalid_backend_response: '確認処理に失敗しました。',
  }

  return messages[props.confirmationError.code] ?? '確認処理に失敗しました。'
})

const confirmButtonLabel = computed(() => {
  if (props.isConfirming) return '確認中'
  if (props.confirmationError && props.confirmationError.retryable)
    return '再試行'
  return '回答を確認'
})

const formTitle = computed(() =>
  props.task.formTitle && props.task.formTitle.trim() !== ''
    ? props.task.formTitle
    : 'Google Form',
)

const handleClick = () => {
  props.onTaskClick?.(props.task.id)
}

const handleKeydown = (event: KeyboardEvent) => {
  if (!isInteractive.value) return
  event.preventDefault()
  handleClick()
}

const handleConfirmClick = (event: MouseEvent) => {
  event.stopPropagation()
  if (isConfirmDisabled.value) return
  props.onConfirmAnswer?.(props.task.id)
}
</script>

<template>
  <article
    class="card-interactive panel-card w-full max-w-full min-w-0 overflow-hidden p-3 sm:p-5"
    :class="{ 'cursor-pointer': isInteractive }"
    :role="isInteractive ? 'button' : undefined"
    :tabindex="isInteractive ? 0 : undefined"
    @click="handleClick"
    @keydown.enter="handleKeydown"
    @keydown.space="handleKeydown"
  >
    <div class="task-card-inner flex min-w-0 gap-2.5 sm:gap-3">
      <div
        class="task-accent w-1.5 flex-shrink-0 rounded-full"
        :style="{ backgroundColor: courseColors.accent }"
      ></div>
      <div class="task-main min-w-0 flex-1 overflow-hidden">
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <span
            class="pill-badge max-w-full"
            :style="{
              backgroundColor: courseColors.badgeBg,
              color: courseColors.badgeText,
            }"
          >
            {{ props.task.subject }}
          </span>
        </div>

        <div
          class="task-content mt-2.5 flex flex-col gap-2.5 sm:mt-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
        >
          <div class="task-body flex min-w-0 flex-1 gap-2.5 sm:gap-3">
            <div
              class="task-index min-w-[1.5rem] flex-shrink-0 text-sm font-semibold text-muted-number sm:min-w-[2.25rem] sm:text-lg"
            >
              {{ props.task.index }}
            </div>
            <div class="task-body-copy min-w-0 flex-1 overflow-hidden">
              <h3
                class="line-clamp-2 min-w-0 max-w-full overflow-hidden break-words text-[13px] font-semibold leading-[1.35] text-[color:var(--color-text-primary)] sm:text-[15px]"
              >
                {{ props.task.title }}
              </h3>
              <p
                v-if="props.task.form"
                class="mt-1 break-words text-[11px] font-medium text-[color:var(--color-text-secondary)] sm:text-sm"
              >
                Form: {{ formTitle }}
              </p>
              <p
                v-if="props.task.sourceLabel"
                class="mt-1 break-words text-[10px] text-[color:var(--color-text-tertiary)] sm:text-xs"
              >
                {{ props.task.sourceLabel }}
              </p>
              <p
                class="mt-1 break-words text-[11px] text-[color:var(--color-text-secondary)] sm:text-sm"
              >
                提出期限: {{ props.task.dueDate }}
              </p>
            </div>
          </div>

          <div
            class="task-actions ml-auto flex min-w-0 shrink-0 flex-col items-end gap-1.5 sm:gap-2"
          >
            <AnswerStatusBadge :status="answerStatus" />

            <p
              v-if="props.task.warning"
              class="break-words text-right text-[10px] font-semibold text-accent sm:text-sm"
            >
              {{ props.task.warning }}
            </p>

            <div
              v-if="hasResolvedForm"
              class="task-confirm-wrap mt-0.5 flex max-w-full flex-col items-end gap-1"
            >
              <button
                data-test="confirm-answer"
                type="button"
                class="confirm-answer-btn inline-flex w-auto max-w-full items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[10px] font-semibold leading-none text-blue-600 transition-colors duration-150 hover:bg-blue-100 hover:text-blue-700 hover:border-blue-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3 sm:text-xs"
                :disabled="isConfirmDisabled"
                :class="{
                  'is-confirming': props.isConfirming,
                  'is-error':
                    props.confirmationError &&
                    props.confirmationError.retryable,
                }"
                @click="handleConfirmClick"
              >
                {{ confirmButtonLabel }}
              </button>
              <p
                v-if="confirmationMessage"
                class="max-w-full text-left text-[10px] leading-relaxed text-[color:var(--color-danger)] sm:text-right sm:text-xs"
              >
                {{ confirmationMessage }}
              </p>
            </div>
            <div
              v-else-if="hasUnresolvedForm"
              class="task-confirm-wrap mt-0.5 flex max-w-full flex-col items-end gap-1"
            >
              <p
                class="max-w-full text-right text-[10px] leading-relaxed text-[color:var(--color-danger)] sm:text-xs"
              >
                Formリンクを確認できません
              </p>
              <button
                data-test="retry-form-link"
                type="button"
                class="inline-flex w-auto max-w-full items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[10px] font-semibold leading-none text-blue-600 sm:px-3 sm:text-xs"
                @click.stop="props.onRetry"
              >
                リンクを再確認
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  word-break: break-word;
}

.task-card-inner,
.task-main,
.task-content,
.task-body,
.task-actions,
.task-confirm-wrap {
  min-width: 0;
}

.confirm-answer-btn {
  display: inline-flex !important;
  width: auto !important;
  max-width: 100% !important;
  min-height: 2.25rem !important;
  padding: 0.375rem 0.75rem !important;
  font-size: 0.75rem !important;
  line-height: 1 !important;
  font-weight: 600 !important;
  border-radius: 9999px !important;
  border: 1px solid #bfdbfe !important;
  background-color: #eff6ff !important;
  color: #2563eb !important;
  cursor: pointer;
  box-shadow: none !important;
  white-space: normal !important;
  overflow-wrap: anywhere;
}

@media (max-width: 430px) {
  .card-interactive {
    padding: 0.75rem !important;
  }

  .task-card-inner {
    gap: 0.5rem;
  }

  .task-accent {
    width: 0.375rem;
  }

  .task-content {
    gap: 0.75rem;
    margin-top: 0.75rem;
  }

  .task-body {
    gap: 0.625rem;
  }

  .task-index {
    min-width: 1.5rem;
    font-size: 0.875rem;
  }

  .task-body-copy h3 {
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .task-body-copy p {
    font-size: 0.6875rem;
    line-height: 1.3;
  }

  .task-actions {
    width: 100%;
    align-items: flex-end;
    gap: 0.5rem;
  }

  .task-confirm-wrap {
    width: 100%;
    align-items: flex-end;
  }

  .confirm-answer-btn {
    width: auto !important;
    min-height: 2.25rem !important;
    padding: 0.45rem 0.7rem !important;
    justify-content: center;
  }
}

.confirm-answer-btn:hover:not(:disabled) {
  background-color: #dbeafe !important;
  border-color: #93c5fd !important;
  color: #1d4ed8 !important;
}

.confirm-answer-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background-color: #eff6ff !important;
  color: #2563eb !important;
  border-color: #bfdbfe !important;
}

.confirm-answer-btn.is-confirming {
  background-color: #e0f2fe !important;
  color: #0369a1 !important;
  border-color: #7dd3fc !important;
}

.confirm-answer-btn.is-error {
  background-color: #fef2f2 !important;
  color: #dc2626 !important;
  border-color: #fca5a5 !important;
}
</style>

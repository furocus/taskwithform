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
  onConfirmAnswer?: (taskId: number) => void
  isConfirming?: boolean
  confirmationError?: ConfirmationErrorLike | null
}>()

const courseColors = computed(() => getCourseColors(props.task.courseId))
const isInteractive = computed(() => Boolean(props.onTaskClick))
const answerStatus = computed(() => props.task.answerStatus ?? 'unreviewed')
const hasForm = computed(() => (props.task.formUrls ?? []).length > 0)
const isConfirmDisabled = computed(
  () => Boolean(props.isConfirming) || !hasForm.value,
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

const handleClick = () => {
  props.onTaskClick?.(String(props.task.id))
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
    class="card-interactive panel-card p-4 sm:p-5"
    :class="{ 'cursor-pointer': isInteractive }"
    :role="isInteractive ? 'button' : undefined"
    :tabindex="isInteractive ? 0 : undefined"
    @click="handleClick"
    @keydown.enter="handleKeydown"
    @keydown.space="handleKeydown"
  >
    <div class="flex gap-3">
      <div
        class="w-1.5 rounded-full"
        :style="{ backgroundColor: courseColors.accent }"
      ></div>
      <div class="flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="pill-badge"
            :style="{
              backgroundColor: courseColors.badgeBg,
              color: courseColors.badgeText,
            }"
          >
            {{ props.task.subject }}
          </span>
        </div>

        <div
          class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        >
          <div class="flex flex-1 min-w-0 gap-3">
            <div
              class="min-w-[2.25rem] text-lg font-semibold text-muted-number"
            >
              {{ props.task.index }}
            </div>
            <div class="flex-1 min-w-0 overflow-hidden">
              <h3
                class="line-clamp-2 max-w-full overflow-hidden break-words text-[15px] font-semibold text-[color:var(--color-text-primary)]"
              >
                {{ props.task.title }}
              </h3>
              <p class="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                提出期限: {{ props.task.dueDate }}
              </p>
            </div>
          </div>

          <div class="flex flex-col items-start sm:items-end gap-2 shrink-0">
            <!-- 1段目: 状態テキスト -->
            <AnswerStatusBadge :status="answerStatus" />

            <!-- 2段目: 期限テキスト -->
            <p
              v-if="props.task.warning"
              class="text-xs sm:text-sm font-semibold text-accent"
            >
              {{ props.task.warning }}
            </p>

            <!-- 3段目: 「回答を確認」ボタン -->
            <div
              v-if="hasForm"
              class="mt-0.5 flex flex-col items-start sm:items-end gap-1"
            >
              <button
                data-test="confirm-answer"
                type="button"
                class="confirm-answer-btn inline-flex w-auto items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold leading-none whitespace-nowrap text-blue-600 transition-colors duration-150 hover:bg-blue-100 hover:text-blue-700 hover:border-blue-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
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
                class="text-xs leading-relaxed text-[color:var(--color-danger)] text-left sm:text-right"
              >
                {{ confirmationMessage }}
              </p>
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

.confirm-answer-btn {
  display: inline-flex !important;
  width: auto !important;
  max-width: fit-content !important;
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
  white-space: nowrap !important;
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

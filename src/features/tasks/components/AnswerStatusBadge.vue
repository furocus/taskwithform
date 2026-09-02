<script setup lang="ts">
import { computed } from 'vue'
import type { AnswerStatus } from '../task.types'

const props = defineProps<{
  status: AnswerStatus
}>()

const label = computed(() => {
  const labels: Record<AnswerStatus, string> = {
    unreviewed: '未確認',
    reviewing: '確認中',
    submitted: '回答済み',
    unreviewable: '回答を確認できない',
    needsReview: '要確認',
  }

  return labels[props.status]
})

const textColor = computed(() => {
  const colors: Record<AnswerStatus, string> = {
    unreviewed: 'var(--color-warning)',
    reviewing: 'var(--color-info)',
    submitted: 'var(--color-success)',
    unreviewable: 'var(--color-text-secondary)',
    needsReview: 'var(--color-warning)',
  }

  return colors[props.status]
})
</script>

<template>
  <span
    class="answer-status-badge max-w-full text-xs font-semibold leading-none sm:text-sm"
    :style="{ color: textColor }"
  >
    {{ label }}
  </span>
</template>

<style scoped>
.answer-status-badge {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  line-height: 1.2;
}
</style>

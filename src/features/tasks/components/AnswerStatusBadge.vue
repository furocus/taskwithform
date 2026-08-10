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

const statusStyle = computed(() => {
  const themes: Record<
    AnswerStatus,
    { backgroundColor: string; color: string; borderColor: string }
  > = {
    unreviewed: {
      backgroundColor: 'var(--color-warning-soft)',
      color: 'var(--color-warning)',
      borderColor: 'var(--color-warning)',
    },
    reviewing: {
      backgroundColor: 'var(--color-info-soft)',
      color: 'var(--color-info)',
      borderColor: 'var(--color-info)',
    },
    submitted: {
      backgroundColor: 'var(--color-success-soft)',
      color: 'var(--color-success)',
      borderColor: 'var(--color-success)',
    },
    unreviewable: {
      backgroundColor: 'var(--color-danger-soft)',
      color: 'var(--color-danger)',
      borderColor: 'var(--color-danger)',
    },
    needsReview: {
      backgroundColor: 'var(--color-orange-soft)',
      color: 'var(--color-orange)',
      borderColor: 'var(--color-orange)',
    },
  }

  return themes[props.status]
})
</script>

<template>
  <span
    class="answer-status-badge inline-flex max-w-full items-center rounded-full border px-3 py-1.5 text-xs font-semibold leading-none whitespace-nowrap"
    :style="statusStyle"
  >
    {{ label }}
  </span>
</template>

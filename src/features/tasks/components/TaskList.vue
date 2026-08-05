<script setup lang="ts">
import type { Task } from '../task.types'
import { getCourseColors } from '../task.utils'
import TaskCard from './TaskCard.vue'

const props = withDefaults(
  defineProps<{
    status?: 'loading' | 'empty' | 'error' | 'ready'
    tasks?: Task[]
    courseId?: string
    onRetry?: () => void
    onTaskClick?: (taskId: string) => void
  }>(),
  {
    status: 'ready',
    tasks: () => [],
    courseId: 'default',
    onRetry: undefined,
  },
)

const courseColors = getCourseColors(props.courseId)
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center justify-between">
      <p class="section-caption">期限が近い順</p>
      <span class="text-xs text-[color:var(--color-text-tertiary)]">
        {{ props.tasks.length }}件
      </span>
    </div>

    <div
      v-if="props.status === 'loading'"
      class="rounded-lg border border-dashed border-[color:var(--color-border-subtle)] p-6 text-center text-sm text-[color:var(--color-text-secondary)]"
    >
      読み込み中
    </div>

    <div
      v-else-if="props.status === 'empty'"
      class="rounded-lg border border-dashed border-[color:var(--color-border-subtle)] p-6 text-center text-sm text-[color:var(--color-text-secondary)]"
    >
      課題はまだありません
    </div>

    <div
      v-else-if="props.status === 'error'"
      class="rounded-lg border border-[color:var(--color-border-subtle)] p-6 text-center text-sm text-[color:var(--color-text-secondary)]"
    >
      <p class="mb-3">課題の読み込みに失敗しました。</p>
      <button
        class="rounded-full border border-[color:var(--color-border-subtle)] px-4 py-2 text-sm font-semibold text-[color:var(--color-text-primary)]"
        type="button"
        @click="props.onRetry"
      >
        もう一度読み込む
      </button>
    </div>

    <div v-else class="space-y-3">
      <div v-if="props.tasks.length > 0" class="rounded-xl p-3">
        <div class="mb-2 flex items-center gap-2">
          <span
            class="task-list-accent inline-flex h-2.5 w-2.5 rounded-full"
            :style="{ backgroundColor: courseColors.accent }"
          />
          <span class="text-xs font-semibold" :style="{ color: courseColors.accent }">
            コース表示
          </span>
        </div>
        <div class="space-y-3">
          <TaskCard
            v-for="task in props.tasks"
            :key="task.id"
            :task="{ ...task, courseId: task.courseId ?? props.courseId }"
            :on-task-click="props.onTaskClick"
          />
        </div>
      </div>

      <div
        v-else
        class="rounded-lg border border-dashed border-[color:var(--color-border-subtle)] p-6 text-center text-sm text-[color:var(--color-text-secondary)]"
      >
        課題はまだありません
      </div>
    </div>

    <div class="section-divider pt-2">
      <span>─── Google Classroomと同期済み ───</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { Task } from '../task.types'
import { computed } from 'vue'
import { getCourseColors } from '../task.utils'

const props = defineProps<{
  task: Task
  onTaskClick?: (taskId: string) => void
}>()

const courseColors = computed(() => getCourseColors(props.task.courseId))

const handleClick = () => {
  props.onTaskClick?.(String(props.task.id))
}
</script>

<template>
  <article
    class="card-interactive panel-card cursor-pointer p-4 sm:p-5"
    role="button"
    tabindex="0"
    @click="handleClick"
    @keydown.enter.prevent="handleClick"
    @keydown.space.prevent="handleClick"
  >
    <div class="flex gap-3">
      <div
        class="w-1.5 rounded-full"
        :style="{ backgroundColor: courseColors.accent }"
      ></div>
      <div class="flex-1">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span
            class="pill-badge"
            :style="{
              backgroundColor: courseColors.badgeBg,
              color: courseColors.badgeText,
            }"
          >
            {{ props.task.subject }}
          </span>
          <span class="text-sm text-[color:var(--color-text-secondary)]">{{
            props.task.dueDate
          }}</span>
        </div>

        <div class="mt-4 flex gap-3">
          <div class="min-w-[2.25rem] text-lg font-semibold text-muted-number">
            {{ props.task.index }}
          </div>
          <div class="flex-1">
            <h3
              class="text-[15px] font-semibold text-[color:var(--color-text-primary)]"
            >
              {{ props.task.title }}
            </h3>
            <p class="mt-1 text-sm text-[color:var(--color-text-secondary)]">
              提出期限: {{ props.task.dueDate }}
            </p>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between">
          <p class="text-sm text-[color:var(--color-text-secondary)]">
            期限まで
          </p>
          <p class="text-sm font-semibold text-accent">
            {{ props.task.warning }}
          </p>
        </div>
      </div>
    </div>
  </article>
</template>

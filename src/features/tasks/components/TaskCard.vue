<script setup lang="ts">
import type { Task } from '../task.types'
import { computed } from 'vue'
import { getCourseColors } from '../task.utils'
import AnswerStatusBadge from './AnswerStatusBadge.vue'

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
          class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="flex flex-1 min-w-0 gap-3">
            <div
              class="min-w-[2.25rem] text-lg font-semibold text-muted-number"
            >
              {{ props.task.index }}
            </div>
            <div class="flex-1 min-w-0">
              <h3
                class="truncate overflow-hidden whitespace-nowrap text-[15px] font-semibold text-[color:var(--color-text-primary)]"
              >
                {{ props.task.title }}
              </h3>
              <p class="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                提出期限: {{ props.task.dueDate }}
              </p>
            </div>
          </div>

          <div class="flex flex-col gap-2 items-start sm:items-end">
            <AnswerStatusBadge
              v-if="props.task.answerStatus"
              :status="props.task.answerStatus"
            />
            <div class="flex items-center justify-between w-full sm:w-auto">
              <div />
              <p class="text-sm font-semibold text-accent">
                {{ props.task.warning }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

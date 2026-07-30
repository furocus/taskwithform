<script setup lang="ts">
import { mockTasks } from '../../../mocks/tasks'
import TaskCard from './TaskCard.vue'
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center justify-between">
      <p class="section-caption">期限が近い順</p>
      <span class="text-xs text-[color:var(--color-text-tertiary)]"
        >{{ mockTasks.length }}件</span
      >
    </div>

    <div class="space-y-3">
      <TaskCard
        v-for="task in mockTasks"
        :key="task.title"
        :title="task.title"
        :deadline="task.deadline"
        :submission-target="task.submissionTarget"
      />
    </div>

    <div class="section-divider pt-2">
      <span>─── Google Classroomと同期済み ───</span>
    </div>
  </section>
</template>

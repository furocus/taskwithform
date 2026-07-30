<script setup lang="ts">
import TaskCard from '../features/tasks/components/TaskCard.vue'
import { mockTasks } from '../mocks/tasks'
</script>

<template>
  <section>
    <p class="text-sm font-semibold text-indigo-600">HOME</p>
    <h1 class="mt-2 text-3xl font-bold text-slate-900">メイン画面</h1>
    <p class="mt-4 text-slate-600">課題一覧を表示するページです。</p>

    <div class="mt-6 space-y-4">
      <TaskCard
        v-for="task in mockTasks"
        :key="task.title"
        :title="task.title"
        :deadline="task.deadline"
        :submission-target="task.submissionTarget"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import TaskCard from '../features/tasks/components/TaskCard.vue'
</script>

<template>
  <section>
    <p class="text-sm font-semibold text-indigo-600">HOME</p>
    <h1 class="mt-2 text-3xl font-bold text-slate-900">メイン画面</h1>
    <p class="mt-4 text-slate-600">課題一覧を表示するページです。</p>

    <div class="mt-6">
      <TaskCard
        title="USK"
        deadline="12/34"
        submissionTarget="ウソの宿題や課題"
      />
    </div>
  </section>
</template>

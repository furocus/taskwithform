<script setup lang="ts">
import { toRaw } from 'vue'
import { RouterView } from 'vue-router'

import AppHeader from './AppHeader.vue'
import {
  provideTaskSyncContext,
  type TaskSyncContextOptions,
} from '../features/tasks/taskSyncContext'

const props = defineProps<TaskSyncContextOptions>()

provideTaskSyncContext({
  repository: props.repository ? toRaw(props.repository) : undefined,
  sync: props.sync,
  fetchImplementation: props.fetchImplementation,
  now: props.now,
  coalesceReloads: true,
})
</script>

<template>
  <div class="min-h-screen w-full bg-[color:var(--color-bg-base)]">
    <AppHeader />
    <main class="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6 sm:py-6">
      <RouterView />
    </main>
  </div>
</template>

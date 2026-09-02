<script setup lang="ts">
import { RouterView } from 'vue-router'

import AppHeader from './AppHeader.vue'
</script>

<template>
  <div class="min-h-screen w-full bg-[color:var(--color-bg-base)]">
    <AppHeader />
    <main class="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6 sm:py-6">
      <RouterView />
    </main>
  </div>
</template>

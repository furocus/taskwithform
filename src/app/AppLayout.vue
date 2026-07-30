<script setup lang="ts">
import { RouterView } from 'vue-router'

import BottomNavigation from '../features/navigation/BottomNavigation.vue'
import AppHeader from './AppHeader.vue'
</script>

<template>
  <div class="min-h-screen bg-[color:var(--color-bg-base)]">
    <AppHeader />
    <main class="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6">
      <RouterView />
    </main>
    <BottomNavigation />
  </div>
</template>

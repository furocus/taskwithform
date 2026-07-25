<script setup lang="ts">
import { RouterView } from 'vue-router'

import BottomNavigation from '../features/navigation/BottomNavigation.vue'
import AppHeader from './AppHeader.vue'
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <AppHeader />
    <main class="mx-auto max-w-3xl px-5 py-8 pb-24">
      <RouterView />
    </main>
    <BottomNavigation />
  </div>
</template>

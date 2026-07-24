<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'

const navigationItems = [
  { name: 'メイン', to: '/' },
  { name: 'カレンダー', to: '/calendar' },
]

const route = useRoute()
</script>

<template>
  <nav
    aria-label="メインナビゲーション"
    class="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white"
  >
    <div class="mx-auto grid max-w-3xl grid-cols-2">
      <RouterLink
        v-for="item in navigationItems"
        :key="item.to"
        :to="item.to"
        class="px-4 py-4 text-center text-sm font-medium text-slate-500 transition-colors hover:text-indigo-600"
        :class="{ 'text-indigo-600': route.path === item.to }"
      >
        {{ item.name }}
      </RouterLink>
    </div>
  </nav>
</template>

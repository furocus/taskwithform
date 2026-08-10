<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const goToMain = () => {
  router.push('/')
}
</script>

<template>
  <section
    class="mx-auto max-w-3xl rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-bg-surface)] p-6 text-center shadow-sm"
  >
    <p class="text-sm text-[color:var(--color-text-secondary)] mb-4">
      カレンダーページは現在準備中です。後ほどご利用ください。
    </p>
    <button
      type="button"
      class="rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-bg-canvas)] px-4 py-2 text-sm font-semibold text-[color:var(--color-text-primary)]"
      @click="goToMain"
    >
      課題一覧へ戻る
    </button>
  </section>
</template>

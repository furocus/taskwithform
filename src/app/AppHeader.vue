<script setup lang="ts">
const today = new Date()
const formattedDate = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`
</script>

<template>
  <header
    class="border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-bg-canvas)] px-4 py-5 sm:px-6"
  >
    <div class="mx-auto flex max-w-3xl items-start justify-between gap-4">
      <div>
        <p class="text-sm font-medium text-[color:var(--color-text-secondary)]">
          {{ formattedDate }}
        </p>
        <h1
          class="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--color-text-primary)]"
        >
          課題一覧
        </h1>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="icon-button icon-button--bell relative"
          type="button"
          aria-label="通知"
        >
          <svg
            class="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          >
            <path
              d="M12 4a4 4 0 0 0-4 4v1.7c0 .8-.2 1.6-.6 2.3L6 13.5V15h12v-1.5l-1.4-1.5a4.8 4.8 0 0 1-.6-2.3V8a4 4 0 0 0-4-4Z"
            />
            <path d="M10 17a2 2 0 0 0 4 0" />
          </svg>
          <span
            class="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold text-white"
            style="background-color: var(--color-badge-count)"
            >3</span
          >
        </button>

        <button
          class="icon-button icon-button--calendar"
          type="button"
          aria-label="カレンダー"
        >
          <svg
            class="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          >
            <rect x="4" y="5" width="16" height="15" rx="2" />
            <path d="M4 9h16" />
            <path d="M8 3v4" />
            <path d="M16 3v4" />
          </svg>
        </button>
      </div>
    </div>
  </header>
</template>

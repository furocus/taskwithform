<script setup lang="ts">
defineProps<{
  title: string
  deadline: string
  submissionTarget: string
}>()
</script>

<template>
  <article class="task-card">
    <!-- 左側の細い赤色のライン -->
    <div class="task-card__line" aria-hidden="true" />

    <div class="task-card__body">
      <h3 class="task-card__title">{{ title }}</h3>

      <dl class="task-card__meta">
        <div class="task-card__row">
          <dt>期限</dt>
          <dd>{{ deadline }}</dd>
        </div>
        <div class="task-card__row">
          <dt>提出先</dt>
          <dd>{{ submissionTarget }}</dd>
        </div>
      </dl>
    </div>
  </article>
</template>

<style scoped>
.task-card {
  display: flex;
  align-items: stretch;
  width: 100%;
  background-color: var(--color-bg-surface, #ffffff);
  border-radius: 8px;
  box-shadow: 0 2px 8px var(--color-shadow, rgba(0, 0, 0, 0.08));
  overflow: hidden;
}

/* 左側の赤ライン（幅4px） */
.task-card__line {
  width: 4px;
  flex-shrink: 0;
  background-color: var(--color-danger, #ef4444);
}

.task-card__body {
  flex: 1;
  min-width: 0;
  padding: 16px;
}

.task-card__title {
  margin: 0 0 12px;
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text-primary, #111827);
  overflow-wrap: break-word;
}

.task-card__meta {
  display: grid;
  gap: 6px;
  margin: 0;
}

.task-card__row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 0.875rem;
  color: var(--color-text-secondary, #4b5563);
}

.task-card__row dt {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--color-text-body, #374151);
}

.task-card__row dd {
  margin: 0;
  overflow-wrap: break-word;
  min-width: 0;
}
</style>

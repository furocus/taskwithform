<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { TaskRecord } from '../../../database/database.types'
import type { DeadlineNotificationStatus } from '../useDeadlineNotifications'

const props = defineProps<{
  status: DeadlineNotificationStatus
  notifications: TaskRecord[]
  date: string
  reload: () => Promise<void>
}>()

const emit = defineEmits<{
  close: []
}>()

const router = useRouter()
const visibleNotifications = computed(() => props.notifications.slice(0, 5))
const otherCount = computed(() =>
  Math.max(0, props.notifications.length - visibleNotifications.value.length),
)

const goToCalendar = (date: string) => {
  emit('close')
  void router.push({ path: '/calendar', query: { date } })
}
</script>

<template>
  <section
    id="notification-popover"
    class="notification-popover panel-card"
    role="dialog"
    tabindex="-1"
    aria-label="通知"
  >
    <h2 class="notification-popover-title">今日が期限の課題</h2>

    <p v-if="status === 'loading'" class="notification-message">
      読み込み中...
    </p>
    <p v-else-if="status === 'empty'" class="notification-message">
      今日が期限の課題はありません。
    </p>
    <div
      v-else-if="status === 'error'"
      class="notification-message notification-error"
    >
      <p>通知の読み込みに失敗しました。</p>
      <button type="button" class="notification-retry" @click="reload">
        再試行
      </button>
    </div>
    <div v-else class="notification-list">
      <button
        v-for="task in visibleNotifications"
        :key="task.id"
        class="notification-item"
        type="button"
        @click="goToCalendar(task.dueDate ?? date)"
      >
        <span class="notification-subject">{{
          task.subjectName || task.courseName
        }}</span>
        <span class="notification-title">{{ task.title }}</span>
        <span class="notification-due">今日が期限</span>
      </button>

      <p v-if="otherCount > 0" class="notification-other">
        ほか{{ otherCount }}件
      </p>
      <button
        type="button"
        class="notification-view-all"
        @click="goToCalendar(date)"
      >
        カレンダーで全て見る
      </button>
    </div>
  </section>
</template>

<style scoped>
.notification-popover {
  position: absolute;
  top: calc(100% + 0.65rem);
  right: 0;
  z-index: 20;
  width: min(22rem, calc(100vw - 1.5rem));
  padding: 1rem;
}

.notification-popover-title {
  margin: 0 0 0.75rem;
  color: var(--color-text-primary);
  font-size: 0.875rem;
  font-weight: 700;
}

.notification-message {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
  line-height: 1.5;
}

.notification-error {
  color: var(--color-danger);
}

.notification-retry,
.notification-view-all {
  margin-top: 0.625rem;
  padding: 0;
  border: 0;
  color: var(--color-danger);
  font-size: 0.75rem;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
  background: none;
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.notification-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.2rem 0.65rem;
  width: 100%;
  padding: 0.625rem;
  border: 1px solid var(--color-border-soft);
  border-radius: 0.5rem;
  color: var(--color-text-primary);
  text-align: left;
  background: var(--color-card-bg);
  cursor: pointer;
}

.notification-item:hover {
  background: var(--color-card-bg-hover);
}

.notification-subject {
  grid-column: 1 / -1;
  overflow: hidden;
  color: var(--color-danger);
  font-size: 0.6875rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notification-title {
  min-width: 0;
  overflow: hidden;
  font-size: 0.8125rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notification-due {
  color: var(--color-text-secondary);
  font-size: 0.6875rem;
  white-space: nowrap;
}

.notification-other {
  margin: 0.15rem 0 0;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  text-align: center;
}
</style>

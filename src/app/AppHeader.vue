<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NotificationPopover from '../features/notifications/components/NotificationPopover.vue'
import { useDeadlineNotifications } from '../features/notifications/useDeadlineNotifications'

const router = useRouter()
const route = useRoute()
const today = new Date()
const formattedDate = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`

const notification = useDeadlineNotifications({ now: () => new Date() })
const notificationStatus = notification.status
const notificationTasks = notification.notifications
const notificationBadgeLabel = notification.badgeLabel
const notificationDate = notification.date
const isNotificationOpen = ref(false)
const notificationArea = ref<HTMLElement | null>(null)
const notificationButton = ref<HTMLButtonElement | null>(null)

const isCalendarPage = computed(() => route.name === 'calendar')
const pageTitle = computed(() =>
  isCalendarPage.value ? 'カレンダー' : '課題一覧',
)

const goToCalendar = () => {
  router.push('/calendar')
}

const goToMain = () => {
  router.push('/')
}

const closeNotifications = (returnFocus = false) => {
  isNotificationOpen.value = false
  if (returnFocus) notificationButton.value?.focus()
}

const toggleNotifications = () => {
  isNotificationOpen.value = !isNotificationOpen.value
}

const handleDocumentPointerDown = (event: PointerEvent) => {
  if (
    isNotificationOpen.value &&
    notificationArea.value &&
    !notificationArea.value.contains(event.target as Node)
  ) {
    closeNotifications()
  }
}

const handleDocumentKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && isNotificationOpen.value) {
    event.preventDefault()
    closeNotifications(true)
  }
}

watch(isNotificationOpen, async (open) => {
  if (!open) return
  await nextTick()
  if (!isNotificationOpen.value) return

  const popover = document.getElementById('notification-popover')
  const firstFocusable = popover?.querySelector<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  )
  const focusTarget = firstFocusable ?? popover
  focusTarget?.focus()
})

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
  <header
    class="w-full border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-bg-canvas)] px-3 py-4 sm:px-6 sm:py-5"
  >
    <div
      class="mx-auto flex w-full max-w-3xl items-start justify-between gap-3 sm:gap-4"
    >
      <div class="min-w-0 flex-1">
        <p
          class="text-xs font-medium text-[color:var(--color-text-secondary)] sm:text-sm"
        >
          {{ formattedDate }}
        </p>
        <h1
          class="mt-1 max-w-full break-words text-xl font-semibold tracking-tight text-[color:var(--color-text-primary)] sm:text-2xl"
        >
          {{ pageTitle }}
        </h1>
      </div>

      <div
        ref="notificationArea"
        class="relative flex shrink-0 items-center gap-2"
      >
        <button
          ref="notificationButton"
          class="icon-button icon-button--bell relative"
          type="button"
          aria-label="通知"
          aria-haspopup="dialog"
          aria-controls="notification-popover"
          :aria-expanded="isNotificationOpen"
          @click="toggleNotifications"
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
            v-if="notificationBadgeLabel"
            data-test="notification-badge"
            class="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold text-white"
            style="background-color: var(--color-badge-count)"
            >{{ notificationBadgeLabel }}</span
          >
        </button>

        <NotificationPopover
          v-if="isNotificationOpen"
          :status="notificationStatus"
          :notifications="notificationTasks"
          :date="notificationDate"
          :reload="notification.reload"
          @close="closeNotifications"
        />

        <button
          class="icon-button icon-button--home"
          type="button"
          :aria-label="isCalendarPage ? 'メイン画面' : 'カレンダー'"
          @click="isCalendarPage ? goToMain() : goToCalendar()"
        >
          <svg
            v-if="isCalendarPage"
            class="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <svg
            v-else
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

<style scoped>
@media (max-width: 430px) {
  header {
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }

  .icon-button {
    width: 2.5rem;
    height: 2.5rem;
    min-width: 2.5rem;
    min-height: 2.5rem;
  }

  .icon-button svg {
    width: 1.1rem;
    height: 1.1rem;
  }
}
</style>

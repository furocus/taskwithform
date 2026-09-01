<script setup lang="ts">
import { computed, ref } from 'vue'
import { getCalendarDays } from '../features/calendar/calendar.utils'
import { useCalendar } from '../features/calendar/useCalendar'
import { getCourseColors } from '../features/tasks/task.utils'

const now = new Date()
const displayedMonth = ref(new Date(now.getFullYear(), now.getMonth(), 1))
const { status, tasksByDate, reload } = useCalendar(displayedMonth)

const monthLabel = computed(
  () =>
    `${displayedMonth.value.getFullYear()}年${displayedMonth.value.getMonth() + 1}月`,
)
const calendarDays = computed(() => getCalendarDays(displayedMonth.value))

const moveMonth = (amount: number) => {
  displayedMonth.value = new Date(
    displayedMonth.value.getFullYear(),
    displayedMonth.value.getMonth() + amount,
    1,
  )
}
</script>

<template>
  <section class="mx-auto w-full max-w-5xl space-y-4">
    <div
      class="flex items-center justify-between gap-3 px-4 sm:px-6 pt-5 -mx-4 sm:-mx-6"
    >
      <button class="calendar-nav-button" type="button" @click="moveMonth(-1)">
        <span aria-hidden="true">‹</span> 前の月
      </button>
      <h1
        class="text-lg font-bold text-[color:var(--color-text-primary)] sm:text-xl"
      >
        {{ monthLabel }}
      </h1>
      <button class="calendar-nav-button" type="button" @click="moveMonth(1)">
        次の月 <span aria-hidden="true">›</span>
      </button>
    </div>

    <div class="panel-card overflow-hidden">
      <div class="calendar-weekdays" aria-hidden="true">
        <span class="calendar-sunday">日</span><span>月</span><span>火</span
        ><span>水</span><span>木</span><span>金</span
        ><span class="calendar-saturday">土</span>
      </div>
      <div class="calendar-grid" aria-label="月間カレンダー">
        <div
          v-for="day in calendarDays"
          :key="day.date"
          class="calendar-day"
          :class="{
            'calendar-day-muted': !day.isCurrentMonth,
            'calendar-day-today': day.isToday,
          }"
        >
          <span
            class="calendar-date"
            :class="{
              'calendar-sunday': day.dayOfWeek === 0,
              'calendar-saturday': day.dayOfWeek === 6,
            }"
          >
            {{ day.dayOfMonth }}
          </span>
          <div class="calendar-tasks">
            <div
              v-for="task in tasksByDate[day.date] ?? []"
              :key="task.id"
              class="calendar-task-item"
            >
              <span
                class="calendar-task-badge"
                :style="{
                  backgroundColor: getCourseColors(task.courseId).badgeBg,
                  color: getCourseColors(task.courseId).badgeText,
                }"
              >
                {{ task.subjectName }}
              </span>
              <span
                class="calendar-task"
                :style="{
                  borderLeftColor: getCourseColors(task.courseId).accent,
                }"
                :title="task.title"
                >{{ task.title }}</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>

    <p v-if="status === 'loading'" class="calendar-message">読み込み中...</p>
    <p v-else-if="status === 'empty'" class="calendar-message">
      この月の未提出課題はありません。
    </p>
    <div v-else-if="status === 'error'" class="calendar-message calendar-error">
      <p>カレンダーの読み込みに失敗しました。</p>
      <button
        type="button"
        class="mt-2 font-semibold underline"
        @click="reload"
      >
        再試行
      </button>
    </div>
  </section>
</template>

<style scoped>
.calendar-nav-button {
  min-height: 2.75rem;
  padding: 0.625rem 0.75rem;
  color: var(--color-text-primary);
  font-size: 0.8125rem;
  font-weight: 600;
  border: none;
  background: none;
  cursor: pointer;
}

.calendar-nav-button:hover {
  color: var(--color-danger);
}

.calendar-weekdays,
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.calendar-weekdays {
  border-bottom: 1px solid var(--color-border-soft);
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  font-weight: 700;
  text-align: center;
}

.calendar-weekdays span {
  padding: 0.75rem 0;
}

.calendar-grid {
  grid-auto-rows: minmax(5.75rem, 1fr);
}

.calendar-day {
  min-width: 0;
  padding: 0.5rem;
  border-right: 1px solid var(--color-border-soft);
  border-bottom: 1px solid var(--color-border-soft);
}

.calendar-day:nth-child(7n) {
  border-right: 0;
}

.calendar-day:nth-last-child(-n + 7) {
  border-bottom: 0;
}

.calendar-day-muted {
  background: color-mix(in srgb, var(--color-bg-base) 55%, transparent);
}

.calendar-day-muted .calendar-date {
  color: var(--color-text-muted);
}

.calendar-date {
  display: inline-flex;
  min-width: 1.5rem;
  min-height: 1.5rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 700;
}

.calendar-day-today .calendar-date {
  background: var(--color-danger);
  color: white;
}

.calendar-tasks {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 0.25rem;
  overflow: hidden;
}

.calendar-task-item {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.calendar-task-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 600;
  width: fit-content;
  line-height: 1;
}

.calendar-task {
  display: block;
  overflow: hidden;
  border-left: 3px solid;
  padding-left: 0.3rem;
  color: var(--color-text-primary);
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-sunday {
  color: var(--color-danger);
}

.calendar-saturday {
  color: #2563eb;
}

.calendar-message {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  text-align: center;
}

.calendar-error {
  color: var(--color-danger);
}

@media (max-width: 640px) {
  .calendar-day {
    min-height: 5.5rem;
    padding: 0.35rem;
  }

  .calendar-task {
    font-size: 0.625rem;
  }
}
</style>

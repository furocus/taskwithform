<script setup lang="ts">
import { reactive } from 'vue'
import type { Task } from '../features/tasks/task.types'
import TaskList from '../features/tasks/components/TaskList.vue'
import { mockTasks } from '../mocks/tasks'

type TaskListState = {
  status: 'loading' | 'empty' | 'error' | 'ready'
  tasks: Task[]
  courseId: string
}

const taskListState = reactive<TaskListState>({
  status: 'ready',
  tasks: mockTasks,
  courseId: 'course-a',
})

const handleRetry = () => {
  taskListState.status = 'loading'

  window.setTimeout(() => {
    taskListState.status = 'ready'
    taskListState.tasks = mockTasks
  }, 300)
}
</script>

<template>
  <section class="space-y-5">
    <TaskList
      :status="taskListState.status"
      :tasks="taskListState.tasks"
      :course-id="taskListState.courseId"
      :on-retry="handleRetry"
    />
  </section>
</template>

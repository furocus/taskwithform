<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  BackendApiError,
  getClassroomCourseCount,
  logoutSession,
} from '../auth.api'

const router = useRouter()
const courseCount = ref<number>()
const loading = ref(true)
const loggingOut = ref(false)
const errorMessage = ref<string>()

async function loadCourseCount() {
  loading.value = true
  errorMessage.value = undefined

  try {
    courseCount.value = await getClassroomCourseCount()
  } catch (error) {
    if (
      error instanceof BackendApiError &&
      (error.code === 'session_expired' || error.code === 'unauthenticated')
    ) {
      await router.replace({
        name: 'login',
        query: { error: 'session_expired' },
      })
      return
    }

    if (
      error instanceof BackendApiError &&
      error.code === 'classroom_forbidden'
    ) {
      errorMessage.value = 'Google Classroomの閲覧が許可されていません。'
      return
    }

    errorMessage.value =
      'コース件数を取得できませんでした。時間をおいて再度お試しください。'
  } finally {
    loading.value = false
  }
}

async function logout() {
  loggingOut.value = true
  errorMessage.value = undefined

  try {
    await logoutSession()
    await router.replace({ name: 'login' })
  } catch {
    errorMessage.value = 'ログアウトできませんでした。もう一度お試しください。'
  } finally {
    loggingOut.value = false
  }
}

onMounted(loadCourseCount)
</script>

<template>
  <section
    class="mt-8 border-t border-slate-200 pt-6"
    aria-label="Google Classroom接続"
    aria-live="polite"
  >
    <p class="text-sm font-medium text-slate-600">ACTIVEなClassroomコース</p>
    <p v-if="loading" class="mt-2 text-slate-500">取得中です…</p>
    <p
      v-else-if="courseCount !== undefined"
      class="mt-2 text-2xl font-bold text-slate-900"
    >
      {{ courseCount }}件
    </p>
    <p v-else class="mt-2 text-slate-500">件数を取得できませんでした。</p>

    <p
      v-if="errorMessage"
      role="alert"
      class="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
    >
      {{ errorMessage }}
    </p>

    <button
      type="button"
      class="mt-8 rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="loggingOut"
      @click="logout"
    >
      {{ loggingOut ? 'ログアウト中…' : 'ログアウト' }}
    </button>
  </section>
</template>

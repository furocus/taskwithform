<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

function login() {
  window.location.assign('/api/auth/google')
}

const errorMessages: Readonly<Record<string, string>> = {
  access_denied: 'Googleログインがキャンセルされました。',
  invalid_state: 'ログインの有効期限が切れました。もう一度お試しください。',
  oauth_failed:
    'Googleログインに失敗しました。時間をおいて再度お試しください。',
  session_expired:
    'Googleセッションの有効期限が切れました。再ログインしてください。',
  session_check_failed:
    '認証状態を確認できませんでした。バックエンドの起動状態を確認してください。',
}

const errorMessage = computed(() => {
  const errorCode = route.query.error
  if (typeof errorCode !== 'string') {
    return undefined
  }

  return (
    errorMessages[errorCode] ??
    'ログイン処理でエラーが発生しました。もう一度お試しください。'
  )
})
</script>

<template>
  <main
    class="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-12"
  >
    <section
      class="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"
    >
      <p class="text-sm font-semibold tracking-wide text-indigo-600">
        TASK WITH FORM
      </p>
      <h1 class="mt-2 text-3xl font-bold text-slate-900">ログイン</h1>
      <p class="mt-3 text-sm leading-6 text-slate-600">
        Google
        Classroomのコース件数を確認するため、Googleアカウントでログインします。
      </p>

      <p
        v-if="errorMessage"
        role="alert"
        class="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
      >
        {{ errorMessage }}
      </p>

      <div class="mt-8">
        <button
          type="button"
          class="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          @click="login"
        >
          Googleでログイン
        </button>
      </div>

      <p class="mt-4 text-xs leading-5 text-slate-500">
        Googleのアクセストークンはブラウザへ保存しません。
      </p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

function login() {
  void router.replace('/')
}
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
        アカウント情報を入力してメイン画面へ進みます。
      </p>

      <form class="mt-8 space-y-5" @submit.prevent="login">
        <label class="block">
          <span class="text-sm font-medium text-slate-700">メールアドレス</span>
          <input
            type="email"
            autocomplete="email"
            class="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">パスワード</span>
          <input
            type="password"
            autocomplete="current-password"
            class="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </label>

        <button
          type="submit"
          class="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          ログイン
        </button>
      </form>
    </section>
  </main>
</template>

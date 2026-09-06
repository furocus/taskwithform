<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isLoggingIn = ref(false)

function login() {
  if (isLoggingIn.value) return

  isLoggingIn.value = true
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
  <main class="login-page">
    <section class="login-card" aria-labelledby="login-title">
      <p class="login-brand">TASK WITH FORM</p>
      <h1 id="login-title" class="login-title">ログイン</h1>
      <p class="login-introduction">
        Googleアカウントでログインすると、Google
        Classroomから課題・資料・ストリーム投稿を、
        Gmailから課題の回答控えを取得できます。
      </p>

      <p v-if="errorMessage" role="alert" class="login-error">
        {{ errorMessage }}
      </p>

      <div class="login-actions">
        <button
          type="button"
          class="login-button"
          :disabled="isLoggingIn"
          @click="login"
        >
          {{ isLoggingIn ? 'Googleへ移動中...' : 'Googleでログイン' }}
        </button>
      </div>

      <div class="login-details">
        <p>
          スコープ追加後にログイン済みの場合は、次の手順で再認証してください。
        </p>
        <p class="reauthentication-steps">
          ログアウト → Google側でアプリの連携を解除 → 再ログイン
        </p>
      </div>

      <p class="login-privacy">
        Googleのアクセストークンはブラウザへ保存しません。
      </p>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: flex;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
  padding: 3rem 1.25rem;
}

.login-card {
  width: min(100%, 32rem);
  border: 1px solid var(--color-border-soft);
  border-radius: 12px;
  padding: clamp(1.5rem, 5vw, 2.5rem);
  background-color: var(--color-card-bg);
  box-shadow: 0 8px 24px var(--color-card-shadow);
}

.login-brand {
  color: var(--color-accent);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.login-title {
  margin-top: 0.5rem;
  color: var(--color-text-primary);
  font-size: clamp(1.75rem, 5vw, 2.25rem);
  font-weight: 700;
  line-height: 1.25;
}

.login-introduction,
.login-details,
.login-privacy {
  line-height: 1.75;
}

.login-introduction {
  margin-top: 0.75rem;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

.login-error {
  margin-top: 1.5rem;
  border: 1px solid var(--color-danger);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  color: var(--color-danger);
  background-color: var(--color-danger-soft);
  font-size: 0.875rem;
}

.login-actions {
  margin-top: 2rem;
}

.login-button {
  width: 100%;
  min-height: 3rem;
  border: 1px solid var(--color-accent-strong);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  color: var(--color-text-inverse);
  background-color: var(--color-accent);
  font-weight: 700;
  cursor: pointer;
}

.login-button:hover:not(:disabled) {
  background-color: var(--color-accent-strong);
}

.login-button:focus-visible {
  outline: 2px solid var(--color-focus-ring-strong);
  outline-offset: 3px;
  box-shadow: 0 0 0 4px var(--color-focus-ring);
}

.login-details {
  margin-top: 1rem;
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
}

.reauthentication-steps {
  margin-top: 0.5rem;
  color: var(--color-text-primary);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.login-privacy {
  margin-top: 1rem;
  color: var(--color-text-tertiary);
  font-size: 0.75rem;
}

@media (max-width: 430px) {
  .login-page {
    align-items: flex-start;
    padding: 2rem 0.75rem;
  }

  .login-card {
    padding: 1.5rem;
  }
}
</style>

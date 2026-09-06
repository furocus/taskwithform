import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import LoginPage from './LoginPage.vue'

const route = vi.hoisted(() => ({
  query: {} as Record<string, string>,
}))
const originalWindow = window

vi.mock('vue-router', () => ({
  useRoute: () => route,
}))

describe('LoginPage', () => {
  let assign: ReturnType<typeof vi.fn>

  beforeEach(() => {
    route.query = {}
    assign = vi.fn()
    vi.stubGlobal(
      'window',
      Object.create(originalWindow, {
        location: {
          value: { assign },
        },
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('主要な説明と再認証手順を表示する', () => {
    const wrapper = mount(LoginPage)

    expect(wrapper.get('h1').text()).toBe('ログイン')
    expect(wrapper.text()).toContain(
      'Google Classroomから課題・資料・ストリーム投稿を',
    )
    expect(wrapper.text()).toContain('Gmailから課題の回答控えを取得できます')
    expect(wrapper.text()).toContain(
      'ログアウト → Google側でアプリの連携を解除 → 再ログイン',
    )
    expect(wrapper.get('button').text()).toBe('Googleでログイン')
  })

  it.each([
    ['access_denied', 'Googleログインがキャンセルされました。'],
    [
      'invalid_state',
      'ログインの有効期限が切れました。もう一度お試しください。',
    ],
    [
      'oauth_failed',
      'Googleログインに失敗しました。時間をおいて再度お試しください。',
    ],
    [
      'session_expired',
      'Googleセッションの有効期限が切れました。再ログインしてください。',
    ],
    [
      'session_check_failed',
      '認証状態を確認できませんでした。バックエンドの起動状態を確認してください。',
    ],
  ])('%sのエラー文言を表示する', (error, message) => {
    route.query = { error }

    const wrapper = mount(LoginPage)

    expect(wrapper.get('[role="alert"]').text()).toBe(message)
  })

  it('未知のエラーコードにはフォールバック文言を表示する', () => {
    route.query = { error: 'unexpected_error' }

    const wrapper = mount(LoginPage)

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'ログイン処理でエラーが発生しました。もう一度お試しください。',
    )
  })

  it('ログインボタンでGoogle OAuthへ遷移する', async () => {
    const wrapper = mount(LoginPage)

    await wrapper.get('button').trigger('click')

    expect(assign).toHaveBeenCalledWith('/api/auth/google')
    expect(wrapper.get('button').text()).toBe('Googleへ移動中...')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })

  it('ログインボタンを連打しても遷移は一回だけ発生する', async () => {
    const wrapper = mount(LoginPage)
    const button = wrapper.get('button')

    await button.trigger('click')
    await button.trigger('click')

    expect(assign).toHaveBeenCalledTimes(1)
  })
})

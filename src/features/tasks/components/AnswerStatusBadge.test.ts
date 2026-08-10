import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AnswerStatusBadge from './AnswerStatusBadge.vue'

describe('AnswerStatusBadge', () => {
  it.each([
    ['unreviewed', '未確認'],
    ['reviewing', '確認中'],
    ['submitted', '回答済み'],
    ['unreviewable', '回答を確認できない'],
    ['needsReview', '要確認'],
  ])('renders %s state with label %s', (status, expectedLabel) => {
    const wrapper = mount(AnswerStatusBadge, {
      props: { status: status as any },
    })

    expect(wrapper.text()).toBe(expectedLabel)
    expect(wrapper.attributes('class')).toContain('answer-status-badge')
  })
})

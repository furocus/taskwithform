import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AnswerStatusBadge from './AnswerStatusBadge.vue'

describe('AnswerStatusBadge', () => {
  it.each([
    ['unreviewed', 'Form回答 未確認'],
    ['reviewing', 'Form回答 確認中'],
    ['submitted', 'Form回答済み'],
    ['unreviewable', 'Form回答を確認できない'],
    ['needsReview', 'Form回答 要確認'],
  ])('renders %s state with label %s', (status, expectedLabel) => {
    const wrapper = mount(AnswerStatusBadge, {
      props: { status: status as any },
    })

    expect(wrapper.text()).toBe(expectedLabel)
    expect(wrapper.attributes('class')).toContain('answer-status-badge')
  })
})

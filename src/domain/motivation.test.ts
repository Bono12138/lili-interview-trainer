import { describe, expect, it } from 'vitest'
import { getPracticeSummary } from './motivation'
import { createInitialState, createRun, rateCard } from './scheduler'
import type { Card, LearningState } from './types'
const cards: Card[] = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, courseId: `case${i % 3}`, chapterId: 'case-map', level: 'core', kind: 'qa', prompt: '题目', answer: '答案', tags: [], sourceRefs: [{ label: '来源', path: 'source' }], estimatedSeconds: 15 }))
function attempt(state: LearningState, card = cards[0], time = '2026-11-04T12:00:00', rating: 'again' | 'good' = 'good') {
  return rateCard(createRun(state, { sessionId: `s${state.sessions.length}`, mode: 'course', queue: [card.id], startedAt: time }), card, { rating, revealedAt: time, ratedAt: time })
}
describe('practice motivation', () => {
  it('starts with zero earned progress and locked achievements', () => {
    const result = getPracticeSummary(cards, createInitialState('v1'), new Date('2026-11-04T12:00:00'))
    expect(result).toMatchObject({ todayCards: 0, dailyGoal: 10, totalXP: 0, streak: 0, goalReached: false })
    expect(result.achievements.every((badge) => !badge.earned)).toBe(true)
  })
  it('rewards honest effort once per distinct card per local day, including mistakes', () => {
    let state = attempt(createInitialState('v1'), cards[0], '2026-11-04T12:00:00', 'again')
    state = attempt(state, cards[0])
    expect(getPracticeSummary(cards, state, new Date('2026-11-04T20:00:00'))).toMatchObject({ todayCards: 1, totalXP: 5, streak: 1 })
    state = attempt(state, cards[0], '2026-11-05T12:00:00')
    expect(getPracticeSummary(cards, state, new Date('2026-11-05T20:00:00'))).toMatchObject({ todayCards: 1, totalXP: 20, streak: 2, recoveredCards: 1 })
  })
  it('reaches the daily goal with ten different cards and detects cross-case learning', () => {
    let state = createInitialState('v1')
    for (const card of cards.slice(0, 10)) state = attempt(state, card)
    const result = getPracticeSummary(cards, state, new Date('2026-11-04T12:00:00'))
    expect(result).toMatchObject({ todayCards: 10, totalXP: 50, goalReached: true })
    expect(result.achievements.find((a) => a.id === 'cross-case')?.earned).toBe(true)
  })
  it('handles local midnight, a missed day, and a streak still alive from yesterday', () => {
    let state = attempt(createInitialState('v1'), cards[0], '2026-11-03T23:59:00')
    state = attempt(state, cards[1], '2026-11-04T00:01:00')
    expect(getPracticeSummary(cards, state, new Date('2026-11-04T00:02:00'))).toMatchObject({ streak: 2, todayCards: 1 })
    expect(getPracticeSummary(cards, state, new Date('2026-11-05T12:00:00')).streak).toBe(2)
    expect(getPracticeSummary(cards, state, new Date('2026-11-06T12:00:00')).streak).toBe(0)
    expect(getPracticeSummary(cards, state, new Date('2026-11-04T00:02:00')).week.map((d) => d.count).slice(-2)).toEqual([1, 1])
  })
  it('does not award a recovery for a single good or award repeated summary passes twice', () => {
    let state = attempt(createInitialState('v1'), cards[0], '2026-11-04T12:00:00', 'again')
    state = attempt(state)
    expect(getPracticeSummary(cards, state, new Date('2026-11-04T12:00:00')).recoveredCards).toBe(0)
    const summary = { ...cards[1], kind: 'summary' as const, level: 'link' as const, checklist: ['一', '二', '三'] }
    for (let i = 0; i < 2; i++) state = rateCard(createRun(state, { sessionId: `sum${i}`, mode: 'course', queue: [summary.id], startedAt: '2026-11-04T12:00:00' }), summary, { rating: 'good', revealedAt: '2026-11-04T12:00:00', ratedAt: '2026-11-04T12:00:00', checklistPassed: true })
    expect(getPracticeSummary([...cards.filter((c) => c.id !== summary.id), summary], state, new Date('2026-11-04T12:00:00')).totalXP).toBe(30)
  })
  it('undoing a rating removes its practice reward and ignores orphan records', () => {
    const before = createInitialState('v1')
    const after = attempt(before)
    expect(getPracticeSummary(cards, after, new Date('2026-11-04T12:00:00')).totalXP).toBe(5)
    expect(getPracticeSummary(cards, before, new Date('2026-11-04T12:00:00')).totalXP).toBe(0)
    expect(getPracticeSummary([], after, new Date('2026-11-04T12:00:00')).totalXP).toBe(0)
  })
})

describe('level progress across practice days', () => {
  it('levels up at 100 practice points while keeping the second day goal separate', () => {
    let state = createInitialState('v1')
    for (const day of ['2026-11-03T12:00:00', '2026-11-04T12:00:00']) {
      for (const card of cards.slice(0, 10)) state = attempt(state, card, day)
    }
    expect(getPracticeSummary(cards, state, new Date('2026-11-04T12:00:00'))).toMatchObject({ todayCards: 10, totalXP: 100, level: 2, levelXP: 0, nextLevelXP: 100, streak: 2 })
  })
})

import { describe, expect, it } from 'vitest'
import { buildQueue, getDashboardStats, getReadiness, isRescueCard } from './progress'
import { createInitialState } from './scheduler'
import type { Card, LearningState, ReviewState } from './types'

const now = '2026-11-04T08:00:00.000Z'
const cards: Card[] = [
  { id: 'core-1', courseId: 'labor-arbitration', chapterId: 'case-map', level: 'core', kind: 'qa', prompt: '核心', answer: '答案', tags: [], sourceRefs: [{ label: '材料', path: '材料.pdf' }], estimatedSeconds: 10 },
  { id: 'advanced-1', courseId: 'labor-arbitration', chapterId: 'case-map', level: 'advanced', kind: 'follow-up', prompt: '检查', answer: '答案', followUps: [{ prompt: '追问', answer: '回答' }], tags: [], sourceRefs: [{ label: '材料', path: '材料.pdf' }], estimatedSeconds: 20 },
  { id: 'link-1', courseId: 'return-property', chapterId: 'interview-performance', level: 'link', kind: 'summary', prompt: '陈述', checklist: ['事实', '证据', '结果'], tags: [], sourceRefs: [{ label: '材料', path: '材料.pdf' }], estimatedSeconds: 90 },
]

function progress(status: ReviewState['status'], lastRating?: 'again' | 'fuzzy' | 'good'): ReviewState {
  return { cardId: 'core-1', goodStreak: status === 'stable' ? 3 : 0, status, dueAt: now, lastRating, lapseCount: lastRating === 'again' ? 1 : 0 }
}

describe('queue building', () => {
  it('prioritizes core cards and only includes advanced when selected', () => {
    const state = createInitialState('v1')
    expect(buildQueue(cards, state, { mode: 'course', courseId: 'labor-arbitration', now })).toEqual(['core-1'])
    expect(buildQueue(cards, state, { mode: 'course', courseId: 'labor-arbitration', includeAdvanced: true, now })).toEqual(['core-1', 'advanced-1'])
  })

  it('supports different-kind chapter checks and link cards', () => {
    const state = createInitialState('v1')
    expect(buildQueue(cards, state, { mode: 'course', courseId: 'labor-arbitration', chapterId: 'case-map', set: 'assessment', now })).toEqual(['advanced-1'])
    expect(buildQueue(cards, state, { mode: 'course', courseId: 'return-property', set: 'link', now })).toEqual(['link-1'])
  })

  it('mixes due cards but does not loop when nothing is due', () => {
    const state = createInitialState('v1')
    state.progress['core-1'] = { ...progress('learning', 'good'), dueAt: '2026-11-05T08:00:00.000Z' }
    expect(buildQueue(cards, state, { mode: 'mixed', now })).toEqual([])
  })

  it('rescues current weak cards without treating old stable cards as mistakes', () => {
    const state = createInitialState('v1')
    expect(isRescueCard(state, 'core-1')).toBe(false)
    state.progress['core-1'] = progress('learning', 'fuzzy')
    expect(isRescueCard(state, 'core-1')).toBe(true)
    expect(buildQueue(cards, state, { mode: 'rescue', now })).toEqual(['core-1'])
    state.progress['core-1'] = progress('stable', 'good')
    expect(isRescueCard(state, 'core-1')).toBe(false)
  })
})

describe('dashboard and readiness', () => {
  it('counts due, learning, stable and new cards from review state', () => {
    const state = createInitialState('v1')
    state.progress['core-1'] = progress('learning', 'again')
    state.progress['link-1'] = { ...progress('stable', 'good'), cardId: 'link-1', dueAt: null }
    expect(getDashboardStats(cards, state, now)).toEqual({ due: 1, learning: 1, stable: 1, fresh: 1 })
  })

  it('returns unassessed without enough records and never claims official qualification', () => {
    const state = createInitialState('v1')
    const result = getReadiness(cards, state)
    expect(result.status).toBe('unassessed')
    expect(result.label).toBe('未评估')
    expect(result.disclaimer).toContain('不是官方')
  })

  it('blocks readiness for unlearned core cards and uncorrected red-line cards', () => {
    const state: LearningState = createInitialState('v1')
    const redLine = { ...cards[0], redLine: true }
    state.progress['core-1'] = progress('learning', 'again')
    const result = getReadiness([redLine, { ...cards[0], id: 'core-2', redLine: false }], state)
    expect(result.status).toBe('in-progress')
    expect(result.checks.find((check) => check.id === 'red-lines')?.passed).toBe(false)
    expect(result.checks.find((check) => check.id === 'core')?.passed).toBe(false)
  })
})


describe('recovery and per-course readiness edge cases', () => {
  it('clears a rescue card after two recent good ratings even before it becomes stable', () => {
    const state = createInitialState('v1')
    state.progress['core-1'] = { ...progress('learning', 'fuzzy'), lapseCount: 1 }
    state.attempts = [
      { attemptId: 'a1', sessionId: 's1', cardId: 'core-1', courseId: 'labor-arbitration', chapterId: 'case-map', mode: 'course', rating: 'good', revealedAt: now, ratedAt: now, responseMs: 1, before: progress('learning'), after: progress('learning', 'good') },
      { attemptId: 'a2', sessionId: 's1', cardId: 'core-1', courseId: 'labor-arbitration', chapterId: 'case-map', mode: 'course', rating: 'good', revealedAt: now, ratedAt: now, responseMs: 1, before: progress('learning'), after: progress('learning', 'good') },
    ]
    state.progress['core-1'].lastRating = 'good'
    expect(isRescueCard(state, 'core-1')).toBe(false)
  })

  it('does not count one course chapter check for every other course', () => {
    const secondCourse = { ...cards[0], id: 'core-2', courseId: 'return-property' }
    const secondCheck = { ...cards[1], id: 'check-2', courseId: 'return-property' }
    const state = createInitialState('v1')
    for (const item of [cards[0], cards[1], secondCourse, secondCheck]) {
      state.progress[item.id] = { ...progress('learning', 'good'), cardId: item.id }
    }
    state.attempts = ['case-map', 'evidence-contribution', 'legal-issues', 'review-comparison', 'interview-performance'].map((chapterId, index) => ({ attemptId: `a${index}`, sessionId: 's1', cardId: 'advanced-1', courseId: 'labor-arbitration', chapterId, mode: 'course' as const, rating: 'good' as const, revealedAt: now, ratedAt: now, responseMs: 1, before: progress('learning'), after: progress('learning', 'good') }))
    const result = getReadiness([...cards, secondCourse, secondCheck], state)
    expect(result.checks.find((check) => check.id === 'chapters')?.passed).toBe(false)
  })
})


describe('chapter performance', () => {
  it('uses rating evidence rather than click counts', async () => {
    const { getChapterPerformance } = await import('./progress')
    const state = createInitialState('v1')
    state.attempts = [
      { attemptId: 'a1', sessionId: 's1', cardId: 'core-1', courseId: 'labor-arbitration', chapterId: 'case-map', mode: 'course', rating: 'again', revealedAt: now, ratedAt: now, responseMs: 1, before: progress('new'), after: progress('learning', 'again') },
      { attemptId: 'a2', sessionId: 's1', cardId: 'core-1', courseId: 'labor-arbitration', chapterId: 'case-map', mode: 'course', rating: 'good', revealedAt: now, ratedAt: now, responseMs: 1, before: progress('learning'), after: progress('learning', 'good') },
    ]
    const result = getChapterPerformance(state)
    expect(result.find((chapter) => chapter.id === 'case-map')).toMatchObject({ attempts: 2, good: 1, percent: 50 })
    expect(result.find((chapter) => chapter.id === 'legal-issues')).toMatchObject({ attempts: 0, percent: 0 })
  })
})

describe('cross-course mixed practice', () => {
  it('interleaves due courses instead of presenting whole courses in a block', () => {
    const state = createInitialState('v1')
    const dueCards = ['a1', 'a2', 'b1', 'b2'].map((id) => ({ ...cards[0], id, courseId: id.startsWith('a') ? 'a' : 'b' }))
    for (const card of dueCards) state.progress[card.id] = { ...progress('learning', 'fuzzy'), cardId: card.id }
    expect(buildQueue(dueCards, state, { mode: 'mixed', now })).toEqual(['a1', 'b1', 'a2', 'b2'])
  })
})

describe('actionable readiness progress', () => {
  it('shows exact partial coverage and the next unlearned card location', () => {
    const state = createInitialState('v1')
    const second = { ...cards[0], id: 'core-2' }
    state.progress['core-1'] = progress('learning', 'good')
    const result = getReadiness([cards[0], second, cards[1]], state)
    expect(result.checks.find((c) => c.id === 'core')).toMatchObject({ completed: 1, total: 2, passed: false })
    expect(result.percent).toBeGreaterThan(0)
    expect(result.percent).toBeLessThan(100)
    expect(result.next).toMatchObject({ set: 'core', courseId: 'labor-arbitration', chapterId: 'case-map' })
  })
  it('uses the latest check result instead of keeping an old success after failure', () => {
    const state = createInitialState('v1')
    const before = progress('learning')
    state.attempts = ['good', 'again'].map((rating, i) => ({ attemptId: `${i}`, sessionId: 's1', cardId: 'advanced-1', courseId: 'labor-arbitration', chapterId: 'case-map', mode: 'course' as const, rating: rating as 'good' | 'again', revealedAt: now, ratedAt: now, responseMs: 0, before, after: before }))
    expect(getReadiness(cards.slice(0, 2), state).checks.find((c) => c.id === 'chapters')).toMatchObject({ completed: 0, total: 1, passed: false })
  })
  it('does not show 100 percent when a large almost-complete course still has one missing card', () => {
    const large = Array.from({ length: 1000 }, (_, i) => ({ ...cards[0], id: `large-${i}` }))
    const state = createInitialState('v1')
    for (const card of large.slice(0, -1)) state.progress[card.id] = { ...progress('learning', 'good'), cardId: card.id }
    expect(getReadiness(large, state).percent).toBeLessThan(100)
    expect(getReadiness(large, createInitialState('v1')).percent).toBe(0)
  })
})

describe('readiness follows the learning path', () => {
  it('recommends a chapter check after covering that chapter, before more core in other chapters', () => {
    const state = createInitialState('v1')
    const later = { ...cards[0], id: 'later', chapterId: 'legal-issues' }
    state.progress['core-1'] = progress('learning', 'good')
    expect(getReadiness([cards[0], cards[1], later], state).next).toMatchObject({ set: 'assessment', chapterId: 'case-map' })
  })
})

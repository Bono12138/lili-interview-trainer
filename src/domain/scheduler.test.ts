import { describe, expect, it } from 'vitest'
import { createInitialState, createRun, rateCard } from './scheduler'
import type { Card, LearningState, Rating } from './types'

const card: Card = {
  id: 'labor.core.result.001',
  courseId: 'labor-arbitration',
  chapterId: 'case-map',
  level: 'core',
  kind: 'qa',
  prompt: '仲裁结果是什么？',
  answer: '以核验材料为准。',
  tags: ['case-result'],
  sourceRefs: [{ label: '材料', path: '材料.pdf' }],
  estimatedSeconds: 15,
}

const now = '2026-11-04T22:00:00.000Z'

function stateWithQueue(queue = [card.id, 'card-2', 'card-3', 'card-4']): LearningState {
  const initial = createInitialState('content-1')
  return createRun(initial, {
    sessionId: 'session-1',
    mode: 'course',
    courseId: card.courseId,
    queue,
    startedAt: now,
  })
}

function rate(state: LearningState, rating: Rating, ratedAt = now) {
  return rateCard(state, card, {
    rating,
    revealedAt: '2026-11-04T21:59:55.000Z',
    ratedAt,
  })
}

describe('scheduler', () => {
  it('reinserts again about three cards later without duplicate positions and downgrades stability', () => {
    const initial = stateWithQueue()
    initial.progress[card.id] = {
      cardId: card.id,
      goodStreak: 3,
      status: 'stable',
      dueAt: null,
      lastRating: 'good',
      lapseCount: 0,
    }

    const next = rate(initial, 'again')

    expect(next.activeRun?.queue).toEqual(['card-2', 'card-3', 'card-4', card.id])
    expect(next.progress[card.id]).toMatchObject({ status: 'learning', goodStreak: 0, lastRating: 'again', lapseCount: 1 })
    expect(next.attempts).toHaveLength(1)
    expect(next.attempts[0]).toMatchObject({ cardId: card.id, rating: 'again', responseMs: 5000, mode: 'course' })
  })

  it('reinserts fuzzy about ten cards later and caps automatic reentries at two', () => {
    const ids = Array.from({ length: 12 }, (_, index) => `card-${index + 2}`)
    const next = rate(stateWithQueue([card.id, ...ids]), 'fuzzy')
    expect(next.activeRun?.queue).toHaveLength(13)
    expect(next.activeRun?.queue.indexOf(card.id)).toBe(10)
    expect(next.activeRun?.queue.filter((id) => id === card.id)).toHaveLength(1)

    let current = next
    current = { ...current, activeRun: { ...current.activeRun!, queue: [card.id] } }
    current = rate(current, 'fuzzy')
    current = { ...current, activeRun: { ...current.activeRun!, queue: [card.id] } }
    current = rate(current, 'again')
    expect(current.activeRun?.queue).toEqual([])
    expect(current.activeRun?.endedAt).toBe(now)
  })

  it('applies first, second and third good scheduling with next local morning at 07:00', () => {
    let current = rate(stateWithQueue([card.id]), 'good')
    expect(current.progress[card.id]).toMatchObject({ goodStreak: 1, status: 'learning' })
    expect(current.progress[card.id].dueAt).toBe(now)

    current = stateWithQueue([card.id])
    current.progress[card.id] = { ...current.progress[card.id], goodStreak: 1, status: 'learning' }
    current = rate(current, 'good')
    expect(current.progress[card.id].goodStreak).toBe(2)
    expect(new Date(current.progress[card.id].dueAt!).getHours()).toBe(7)
    const expectedMorning = new Date(now)
    if (expectedMorning.getHours() >= 7) expectedMorning.setDate(expectedMorning.getDate() + 1)
    expectedMorning.setHours(7, 0, 0, 0)
    expect(current.progress[card.id].dueAt).toBe(expectedMorning.toISOString())

    current = stateWithQueue([card.id])
    current.progress[card.id] = { ...current.progress[card.id], goodStreak: 2, status: 'learning' }
    current = rate(current, 'good')
    expect(current.progress[card.id]).toMatchObject({ goodStreak: 3, status: 'stable', dueAt: null })
  })

  it('resets the good streak after fuzzy', () => {
    const initial = stateWithQueue([card.id])
    initial.progress[card.id] = { cardId: card.id, goodStreak: 2, status: 'learning', dueAt: now, lastRating: 'good', lapseCount: 0 }
    expect(rate(initial, 'fuzzy').progress[card.id].goodStreak).toBe(0)
  })
})

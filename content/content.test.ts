import { describe, expect, it } from 'vitest'
import { courseContent } from '../src/content'
import { REQUIRED_CHAPTERS, REQUIRED_COURSES, validateContent } from '../src/domain/content'

describe('bundled course content', () => {
  it('contains all ten courses, five chapters and valid card contracts', () => {
    expect(courseContent.courses.map((course) => course.id)).toEqual(REQUIRED_COURSES)
    expect(validateContent(courseContent)).toEqual([])
    for (const course of courseContent.courses) {
      expect(course.chapters.map((chapter) => chapter.id)).toEqual(REQUIRED_CHAPTERS)
      expect(course.cards.some((card) => card.kind === 'summary' && card.estimatedSeconds === 90)).toBe(true)
      expect(course.cards.some((card) => card.kind === 'follow-up')).toBe(true)
    }
  })

  it('marks source-checked bundled material as verified', () => {
    expect(courseContent.status).toBe('verified')
  })
})

describe('training entry points', () => {
  it('makes every published card reachable in core, advanced or linked training', async () => {
    const { buildQueue } = await import('../src/domain/progress')
    const { createInitialState } = await import('../src/domain/scheduler')
    const state = createInitialState(courseContent.contentVersion)
    const cards = courseContent.courses.flatMap((course) => course.cards)
    for (const course of courseContent.courses) {
      const reachable = new Set(['core', 'advanced', 'link'].flatMap((set) => buildQueue(cards, state, {
        mode: 'course', courseId: course.id, set: set as 'core' | 'advanced' | 'link', now: '2026-11-04T08:00:00.000Z',
      })))
      expect(course.cards.filter((card) => !reachable.has(card.id)).map((card) => card.id)).toEqual([])
    }
  })
})

describe('achievable formal readiness', () => {
  it('can reach 100 percent after successfully completing all available formal training', async () => {
    const { getReadiness } = await import('../src/domain/progress')
    const { createInitialState, createRun, rateCard } = await import('../src/domain/scheduler')
    const cards = courseContent.courses.flatMap((course) => course.cards)
    let state = createInitialState(courseContent.contentVersion)
    const now = '2026-11-04T12:00:00.000Z'
    for (const card of cards) {
      for (let i = 0; i < 2; i++) {
        state = createRun(state, { sessionId: `${card.id}-${i}`, mode: 'course', queue: [card.id], startedAt: now })
        state = rateCard(state, card, { rating: 'good', revealedAt: now, ratedAt: now, ...(card.kind === 'summary' ? { checklistPassed: true } : {}) })
      }
    }
    const result = getReadiness(cards, state)
    expect(result.status).toBe('ready')
    expect(result.percent).toBe(100)
    expect(result.checks.every((check) => check.passed)).toBe(true)
    expect(result.next).toBeUndefined()
  })
})

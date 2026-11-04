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

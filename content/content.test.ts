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

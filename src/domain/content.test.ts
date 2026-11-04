import { describe, expect, it } from 'vitest'
import { REQUIRED_COURSES, validateContent } from './content'
import type { Card, Course } from './types'

const chapters = ['case-map', 'evidence-contribution', 'legal-issues', 'review-comparison', 'interview-performance']

function card(courseId: string, chapterId: string, id: string): Card {
  return {
    id,
    courseId,
    chapterId,
    level: 'core',
    kind: chapterId === 'interview-performance' ? 'summary' : 'qa',
    prompt: `${id} 的题面`,
    ...(chapterId === 'interview-performance'
      ? { checklist: ['事实', '规则', '表达'], estimatedSeconds: 90 }
      : { answer: '经材料核验的答案', estimatedSeconds: 20 }),
    tags: chapterId === 'case-map' ? ['case-result'] : chapterId === 'evidence-contribution' ? ['own-work'] : [],
    sourceRefs: [{ label: '已核验材料', path: '材料.pdf' }],
  }
}

function validContent() {
  const courses: Course[] = REQUIRED_COURSES.map((id) => {
    return {
      id,
      title: `课程 ${id}`,
      description: '课程说明',
      chapters: chapters.map((chapterId) => ({ id: chapterId, title: chapterId })),
      cards: chapters.map((chapterId, cardIndex) => card(id, chapterId, `${id}.card.${cardIndex}`)),
    }
  })
  return { contentVersion: '2026.11.04', status: 'verified' as const, courses }
}

describe('validateContent', () => {
  it('accepts ten complete courses and five chapters each', () => {
    expect(validateContent(validContent())).toEqual([])
  })

  it('reports duplicate ids, invalid chapters, missing answers and sources with paths', () => {
    const content = validContent()
    content.courses[0].cards[1] = { ...content.courses[0].cards[0], chapterId: 'unknown' }
    content.courses[0].cards[2].answer = undefined
    content.courses[0].cards[3].sourceRefs = []

    const errors = validateContent(content)
    expect(errors.some((error) => error.includes('重复'))).toBe(true)
    expect(errors.some((error) => error.includes('unknown'))).toBe(true)
    expect(errors.some((error) => error.includes('答案'))).toBe(true)
    expect(errors.some((error) => error.includes('来源'))).toBe(true)
  })

  it('requires summary checklists and reports missing courses and chapters', () => {
    const content = validContent()
    content.courses = content.courses.slice(1)
    content.courses[0].cards = content.courses[0].cards.filter((item) => item.chapterId !== 'case-map')
    const summary = content.courses[0].cards.find((item) => item.kind === 'summary')!
    summary.checklist = []

    const errors = validateContent(content)
    expect(errors.some((error) => error.includes('labor-arbitration'))).toBe(true)
    expect(errors.some((error) => error.includes('case-map'))).toBe(true)
    expect(errors.some((error) => error.includes('checklist'))).toBe(true)
  })
})

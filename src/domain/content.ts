import type { Card, CourseContent } from './types'

export const REQUIRED_CHAPTERS = [
  'case-map',
  'evidence-contribution',
  'legal-issues',
  'review-comparison',
  'interview-performance',
] as const

export const REQUIRED_COURSES = [
  'labor-arbitration',
  'return-property',
  'obtaining-loan-by-fraud',
  'cross-border-family',
  'post-divorce-property',
  'digital-assets',
  'trademark-transfer',
  'equity-design',
  'elder-care-fall',
  'elder-care-choking',
] as const

export function validateContent(content: CourseContent): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  const actualCourses = new Set(content.courses.map((course) => course.id))
  for (const courseId of REQUIRED_COURSES) {
    if (!actualCourses.has(courseId)) errors.push(`缺少课程：${courseId}`)
  }

  for (const course of content.courses) {
    const chapterIds = new Set(course.chapters.map((chapter) => chapter.id))
    for (const chapterId of REQUIRED_CHAPTERS) {
      if (!chapterIds.has(chapterId) || !course.cards.some((item) => item.chapterId === chapterId)) {
        errors.push(`${course.id} 缺少章节或卡片：${chapterId}`)
      }
    }

    for (const item of course.cards) {
      validateCard(item, course.id, chapterIds, ids, errors)
    }
  }

  return errors
}

function validateCard(item: Card, courseId: string, chapterIds: Set<string>, ids: Set<string>, errors: string[]) {
  const path = `${courseId}.cards.${item.id}`
  if (ids.has(item.id)) errors.push(`卡片 ID 重复：${item.id}`)
  ids.add(item.id)
  if (item.courseId !== courseId) errors.push(`${path} 的课程引用无效`)
  if (!chapterIds.has(item.chapterId)) errors.push(`${path} 的章节引用无效：${item.chapterId}`)
  if (item.kind === 'summary') {
    if (!item.checklist || item.checklist.length < 3) errors.push(`${path} 的 summary 缺少至少 3 项 checklist`)
  } else if (!item.answer?.trim() && !item.answerPoints?.some((point) => point.trim())) {
    errors.push(`${path} 缺少答案`)
  }
  if (!item.sourceRefs.length || item.sourceRefs.some((source) => !source.label.trim() || !source.path.trim())) {
    errors.push(`${path} 缺少来源`)
  }
  if (item.kind === 'follow-up' && !item.followUps?.length) errors.push(`${path} 缺少追问`)
}

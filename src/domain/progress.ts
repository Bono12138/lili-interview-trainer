import type { Card, LearningState, TrainingMode } from './types'

export interface QueueOptions {
  mode: TrainingMode
  courseId?: string
  chapterId?: string
  set?: 'core' | 'assessment' | 'link' | 'advanced'
  includeAdvanced?: boolean
  now: string
}

export function buildQueue(cards: Card[], state: LearningState, options: QueueOptions): string[] {
  const now = new Date(options.now).getTime()
  let candidates = cards.filter((card) => {
    if (options.courseId && card.courseId !== options.courseId) return false
    if (options.chapterId && card.chapterId !== options.chapterId) return false
    if (options.mode === 'rescue' && !isRescueCard(state, card.id)) return false
    return true
  })

  if (options.set === 'assessment') {
    candidates = candidates.filter((card) => card.level === 'advanced' && card.kind !== 'summary')
  } else if (options.set === 'link') {
    candidates = candidates.filter((card) => card.level === 'link')
  } else if (options.set === 'advanced') {
    candidates = candidates.filter((card) => card.level === 'advanced')
  } else if (options.mode !== 'rescue') {
    candidates = candidates.filter((card) => card.level === 'core' || (options.includeAdvanced && card.level === 'advanced'))
  }

  if (options.mode === 'mixed') {
    candidates = candidates.filter((card) => {
      const review = state.progress[card.id]
      return review && review.status !== 'stable' && review.dueAt !== null && new Date(review.dueAt).getTime() <= now
    })
    candidates.sort((a, b) => rescueScore(state, b.id) - rescueScore(state, a.id))
    // Keep the highest-priority card first, then alternate cases where possible.
    const remaining = [...candidates]
    candidates = []
    while (remaining.length) {
      const previousCourse = candidates.at(-1)?.courseId
      const otherCourse = remaining.findIndex((card) => card.courseId !== previousCourse)
      candidates.push(remaining.splice(otherCourse < 0 ? 0 : otherCourse, 1)[0])
    }
  }

  return candidates.map((card) => card.id)
}

export function isRescueCard(state: LearningState, cardId: string): boolean {
  const review = state.progress[cardId]
  if (!review || review.status === 'stable') return false
  const attempts = state.attempts.filter((attempt) => attempt.cardId === cardId)
  const recent = attempts.slice(-2)
  if (recent.length === 2 && recent.every((attempt) => attempt.rating === 'good' && attempt.checklistPassed !== false)) return false
  if (review.lastRating === 'again' || review.lastRating === 'fuzzy' || review.lapseCount > 0) return true
  return attempts.some((attempt) => attempt.checklistPassed === false) && attempts.at(-1)?.checklistPassed !== true
}

function rescueScore(state: LearningState, cardId: string): number {
  const review = state.progress[cardId]
  if (!review) return 0
  return review.lapseCount * 3 + (review.lastRating === 'again' ? 2 : review.lastRating === 'fuzzy' ? 1 : 0)
}

export function getDashboardStats(cards: Card[], state: LearningState, now: string) {
  const timestamp = new Date(now).getTime()
  let due = 0
  let learning = 0
  let stable = 0
  let fresh = 0
  for (const card of cards) {
    const review = state.progress[card.id]
    if (!review || review.status === 'new') fresh += 1
    else if (review.status === 'stable') stable += 1
    else learning += 1
    if (review && review.status !== 'stable' && review.dueAt && new Date(review.dueAt).getTime() <= timestamp) due += 1
  }
  return { due, learning, stable, fresh }
}

export interface ReadinessResult {
  status: 'unassessed' | 'in-progress' | 'ready'
  label: string
  disclaimer: string
  checks: Array<{ id: string; label: string; passed: boolean }>
}

export function getReadiness(cards: Card[], state: LearningState): ReadinessResult {
  const coreCards = cards.filter((card) => card.level === 'core')
  const redLines = cards.filter((card) => card.redLine)
  const courseIds = [...new Set(cards.map((card) => card.courseId))]
  const chapterIds = [...new Set(cards.map((card) => card.chapterId))]
  const checks = [
    { id: 'core', label: '核心卡全部学习', passed: coreCards.every((card) => state.progress[card.id] && state.progress[card.id].status !== 'new') },
    { id: 'chapters', label: '每案五个章节均完成换问法检查', passed: courseIds.every((courseId) => chapterIds.every((chapterId) => state.attempts.some((attempt) => attempt.courseId === courseId && attempt.chapterId === chapterId && attempt.rating === 'good' && cards.find((card) => card.id === attempt.cardId)?.level === 'advanced'))) },
    { id: 'summaries', label: '每案至少完成一次串联陈述', passed: courseIds.every((courseId) => state.attempts.some((attempt) => attempt.courseId === courseId && attempt.checklistPassed === true)) },
    { id: 'red-lines', label: '没有未纠正的红线卡', passed: redLines.every((card) => state.progress[card.id]?.lastRating === 'good') },
    { id: 'high-risk', label: '高风险错卡最近两次稳定答对', passed: cards.filter((card) => card.redLine || (state.progress[card.id]?.lapseCount ?? 0) > 0).every((card) => {
      const recent = state.attempts.filter((attempt) => attempt.cardId === card.id).slice(-2)
      return recent.length === 2 && recent.every((attempt) => attempt.rating === 'good')
    }) },
  ]
  const unassessed = state.attempts.length === 0 && Object.keys(state.progress).length === 0
  const passed = checks.every((check) => check.passed)
  return {
    status: unassessed ? 'unassessed' : passed ? 'ready' : 'in-progress',
    label: unassessed ? '未评估' : passed ? '已完成自设准备项' : '准备中',
    disclaimer: '这是自设学习反馈，不是官方面试合格预测。',
    checks,
  }
}


export function getChapterPerformance(state: LearningState) {
  const chapters = [
    ['case-map', '案件地图'],
    ['evidence-contribution', '证据与本人工作'],
    ['legal-issues', '法律争点'],
    ['review-comparison', '复盘与关联案件'],
    ['interview-performance', '面试表达与压力追问'],
  ] as const
  return chapters.map(([id, title]) => {
    const attempts = state.attempts.filter((attempt) => attempt.chapterId === id)
    const good = attempts.filter((attempt) => attempt.rating === 'good').length
    return { id, title, attempts: attempts.length, good, percent: attempts.length ? Math.round(good / attempts.length * 100) : 0 }
  })
}

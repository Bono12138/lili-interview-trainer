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

export interface ReadinessAction {
  label: string
  mode: TrainingMode
  set: 'core' | 'assessment' | 'link'
  courseId?: string
  chapterId?: string
}
export interface ReadinessResult {
  status: 'unassessed' | 'in-progress' | 'ready'
  label: string
  percent: number
  disclaimer: string
  checks: Array<{ id: string; label: string; passed: boolean; completed: number; total: number }>
  next?: ReadinessAction
}

export function getReadiness(cards: Card[], state: LearningState): ReadinessResult {
  const known = new Map(cards.map((card) => [card.id, card]))
  const attempts = state.attempts.filter((attempt) => {
    const card = known.get(attempt.cardId)
    return card && card.courseId === attempt.courseId && card.chapterId === attempt.chapterId
  })
  const coreCards = cards.filter((card) => card.level === 'core')
  const redLines = cards.filter((card) => card.redLine)
  const courseIds = [...new Set(cards.map((card) => card.courseId))]
  const chapterIds = [...new Set(cards.map((card) => card.chapterId))]
  const chapterPairs = courseIds.flatMap((courseId) => chapterIds.filter((chapterId) => cards.some((card) => card.courseId === courseId && card.chapterId === chapterId && card.level === 'advanced')).map((chapterId) => ({ courseId, chapterId })))
  const chapterPassed = (courseId: string, chapterId: string) => {
    const latest = attempts.filter((a) => a.courseId === courseId && a.chapterId === chapterId && known.get(a.cardId)?.level === 'advanced').at(-1)
    return latest?.rating === 'good'
  }
  const summaryPassed = (courseId: string) => {
    const latest = attempts.filter((a) => a.courseId === courseId && known.get(a.cardId)?.kind === 'summary').at(-1)
    return latest?.rating === 'good' && latest.checklistPassed === true
  }
  const riskCards = cards.filter((card) => card.redLine || (state.progress[card.id]?.lapseCount ?? 0) > 0)
  const riskPassed = (card: Card) => {
    const recent = attempts.filter((a) => a.cardId === card.id).slice(-2)
    return recent.length === 2 && recent.every((a) => a.rating === 'good' && a.checklistPassed !== false)
  }
  const check = (id: string, label: string, completed: number, total: number) => ({ id, label, completed, total, passed: completed === total })
  const checks = [
    check('core', '核心覆盖', coreCards.filter((card) => state.progress[card.id] && state.progress[card.id].status !== 'new').length, coreCards.length),
    check('chapters', '章节检查', chapterPairs.filter((pair) => chapterPassed(pair.courseId, pair.chapterId)).length, chapterPairs.length),
    check('summaries', '整案陈述', courseIds.filter(summaryPassed).length, courseIds.length),
    check('red-lines', '红线纠正', redLines.filter((card) => state.progress[card.id]?.lastRating === 'good').length, redLines.length),
    check('high-risk', '风险巩固', riskCards.filter(riskPassed).length, riskCards.length),
  ]
  const unassessed = attempts.length === 0 && !cards.some((card) => state.progress[card.id])
  const passed = cards.length > 0 && checks.every((item) => item.passed)
  const weights = [30, 25, 25, 10, 10]
  const possible = checks.reduce((sum, item, index) => sum + (item.total ? weights[index] : 0), 0)
  const earned = checks.reduce((sum, item, index) => sum + (item.total ? item.completed / item.total * weights[index] : 0), 0)
  const percent = unassessed || !possible ? 0 : passed ? 100 : Math.min(99, Math.round(earned / possible * 100))
  let next: ReadinessAction | undefined
  for (const courseId of courseIds) {
    for (const chapterId of chapterIds) {
      const missing = coreCards.find((card) => card.courseId === courseId && card.chapterId === chapterId && (!state.progress[card.id] || state.progress[card.id].status === 'new'))
      if (missing) { next = { label: '继续核心回忆', mode: 'course', set: 'core', courseId, chapterId }; break }
      if (cards.some((card) => card.courseId === courseId && card.chapterId === chapterId && card.level === 'advanced') && !chapterPassed(courseId, chapterId)) {
        next = { label: '完成下一章节检查', mode: 'course', set: 'assessment', courseId, chapterId }; break
      }
    }
    if (next) break
    if (cards.some((card) => card.courseId === courseId && card.kind === 'summary') && !summaryPassed(courseId)) {
      next = { label: '练一次整案陈述', mode: 'course', set: 'link', courseId }; break
    }
  }
  if (!next) {
    const risk = riskCards.find((card) => !riskPassed(card))
    if (risk) next = { label: '巩固关键卡回忆', mode: 'course', set: risk.level === 'core' ? 'core' : risk.level === 'advanced' ? 'assessment' : 'link', courseId: risk.courseId, chapterId: risk.chapterId }
  }
  return {
    status: unassessed ? 'unassessed' : passed ? 'ready' : 'in-progress',
    label: unassessed ? '未评估' : passed ? '已完成自设准备项' : '准备中',
    percent, checks, next,
    disclaimer: '按自设训练项目计算，不是官方面试合格概率。',
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

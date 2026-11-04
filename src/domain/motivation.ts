import type { Card, LearningState } from './types'

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function dayBefore(date: Date, offset = 1): Date {
  const result = new Date(date)
  result.setDate(result.getDate() - offset)
  return result
}

// Rewards are derived from the same attempt history as learning progress, so
// undo/import works without another counter or storage migration.
export function getPracticeSummary(cards: Card[], state: LearningState, now: Date) {
  const known = new Map(cards.map((card) => [card.id, card]))
  const today = localDateKey(now)
  const days = new Map<string, Set<string>>()
  const courseIds = new Set<string>()
  const passedCourses = new Set<string>()
  const recovered = new Set<string>()
  const recovery = new Map<string, { weak: boolean; streak: number }>()
  for (const attempt of state.attempts) {
    const card = known.get(attempt.cardId)
    if (!card || !Number.isFinite(Date.parse(attempt.ratedAt))) continue
    const day = localDateKey(new Date(attempt.ratedAt))
    if (day > today) continue
    if (!days.has(day)) days.set(day, new Set())
    days.get(day)!.add(card.id)
    courseIds.add(card.courseId)
    if (card.kind === 'summary' && attempt.rating === 'good' && attempt.checklistPassed === true) passedCourses.add(card.courseId)
    const previous = recovery.get(card.id) ?? { weak: false, streak: 0 }
    const good = attempt.rating === 'good' && attempt.checklistPassed !== false
    const next = { weak: previous.weak || !good, streak: good ? previous.streak + 1 : 0 }
    if (next.weak && next.streak >= 2) recovered.add(card.id)
    recovery.set(card.id, next)
  }
  let streak = 0
  let cursor = days.has(today) ? now : dayBefore(now)
  while (days.has(localDateKey(cursor))) { streak++; cursor = dayBefore(cursor) }
  let longestStreak = 0
  for (const day of days.keys()) {
    let length = 0
    let previous = new Date(`${day}T12:00:00`)
    while (days.has(localDateKey(previous))) { length++; previous = dayBefore(previous) }
    longestStreak = Math.max(longestStreak, length)
  }
  const todayCards = days.get(today)?.size ?? 0
  const dailyGoal = Math.min(10, cards.length)
  const distinctCards = new Set([...days.values()].flatMap((ids) => [...ids])).size
  const totalXP = [...days.values()].reduce((sum, ids) => sum + ids.size * 5, 0) + recovered.size * 10 + passedCourses.size * 20
  const level = Math.floor(totalXP / 100) + 1
  const achievements = [
    { id: 'first', title: '迈出第一步', detail: '练习第一张卡', earned: distinctCards > 0 },
    { id: 'daily-ten', title: '十张小目标', detail: '一天练习 10 张不同卡', earned: [...days.values()].some((ids) => ids.size >= 10) },
    { id: 'cross-case', title: '跨案切换', detail: '练习 3 个不同案件', earned: courseIds.size >= 3 },
    { id: 'recovery', title: '错卡翻盘', detail: '薄弱卡连续两次评为会', earned: recovered.size > 0 },
    { id: 'summary', title: '整案开口', detail: '首次通过整案陈述核对', earned: passedCourses.size > 0 },
    { id: 'streak', title: '连续三天', detail: '连续 3 天留下练习记录', earned: longestStreak >= 3 },
  ]
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = dayBefore(now, 6 - index)
    const key = localDateKey(date)
    return { key, label: ['日', '一', '二', '三', '四', '五', '六'][date.getDay()], count: days.get(key)?.size ?? 0, today: key === today }
  })
  return { todayCards, dailyGoal, totalXP, level, levelXP: totalXP % 100, nextLevelXP: 100 - totalXP % 100, streak, goalReached: dailyGoal > 0 && todayCards >= dailyGoal, recoveredCards: recovered.size, passedCourses: passedCourses.size, distinctCards, week, achievements }
}
export type PracticeSummary = ReturnType<typeof getPracticeSummary>

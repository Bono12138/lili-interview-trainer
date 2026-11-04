import type { Attempt, Card, LearningState, Rating, ReviewState, TrainingMode } from './types'

export function createInitialState(contentVersion: string): LearningState {
  return {
    schemaVersion: 1,
    contentVersion,
    progress: {},
    attempts: [],
    sessions: [],
    activeRun: null,
    preferences: {
      includeAdvanced: false,
      lastCourseId: 'labor-arbitration',
      lastMode: 'course',
    },
  }
}

export function createRun(
  state: LearningState,
  options: {
    sessionId: string
    mode: TrainingMode
    courseId?: string
    chapterId?: string
    queue: string[]
    startedAt: string
  },
): LearningState {
  const queue = [...new Set(options.queue)]
  return {
    ...state,
    sessions: [
      ...state.sessions,
      {
        id: options.sessionId,
        startedAt: options.startedAt,
        ...(queue.length === 0 ? { endedAt: options.startedAt } : {}),
        mode: options.mode,
        courseId: options.courseId,
        chapterId: options.chapterId,
        attemptIds: [],
      },
    ],
    activeRun: {
      sessionId: options.sessionId,
      mode: options.mode,
      courseId: options.courseId,
      chapterId: options.chapterId,
      queue,
      reentries: {},
      startedAt: options.startedAt,
      ...(queue.length === 0 ? { endedAt: options.startedAt } : {}),
    },
    preferences: {
      ...state.preferences,
      lastMode: options.mode,
      lastCourseId: options.courseId ?? state.preferences.lastCourseId,
    },
  }
}

export function rateCard(
  state: LearningState,
  card: Card,
  input: { rating: Rating; revealedAt: string; ratedAt: string; elapsedSeconds?: number; checklistPassed?: boolean },
): LearningState {
  const run = state.activeRun
  if (!run || run.endedAt || run.queue[0] !== card.id) return state

  const before = state.progress[card.id] ?? newReviewState(card.id)
  const after = nextReviewState(before, input.rating, input.ratedAt)
  const attemptId = `${run.sessionId}:${card.id}:${state.attempts.length + 1}`
  const attempt: Attempt = {
    attemptId,
    sessionId: run.sessionId,
    cardId: card.id,
    courseId: card.courseId,
    chapterId: card.chapterId,
    mode: run.mode,
    rating: input.rating,
    revealedAt: input.revealedAt,
    ratedAt: input.ratedAt,
    responseMs: Math.max(0, new Date(input.ratedAt).getTime() - new Date(input.revealedAt).getTime()),
    before: { ...before },
    after: { ...after },
    ...(input.elapsedSeconds === undefined ? {} : { elapsedSeconds: input.elapsedSeconds }),
    ...(input.checklistPassed === undefined ? {} : { checklistPassed: input.checklistPassed }),
  }

  const queue = run.queue.slice(1)
  const reentries = { ...run.reentries }
  const shouldReenter = input.rating !== 'good' && (reentries[card.id] ?? 0) < 2
  if (shouldReenter) {
    const offset = input.rating === 'again' ? 3 : 10
    queue.splice(Math.min(offset, queue.length), 0, card.id)
    reentries[card.id] = (reentries[card.id] ?? 0) + 1
  }
  const endedAt = queue.length === 0 ? input.ratedAt : undefined

  return {
    ...state,
    progress: { ...state.progress, [card.id]: after },
    attempts: [...state.attempts, attempt],
    sessions: state.sessions.map((session) => session.id === run.sessionId
      ? { ...session, attemptIds: [...session.attemptIds, attemptId], ...(endedAt ? { endedAt } : {}) }
      : session),
    activeRun: { ...run, queue, reentries, ...(endedAt ? { endedAt } : {}) },
  }
}

export function newReviewState(cardId: string): ReviewState {
  return { cardId, goodStreak: 0, status: 'new', dueAt: null, lapseCount: 0 }
}

function nextReviewState(before: ReviewState, rating: Rating, ratedAt: string): ReviewState {
  if (rating === 'again') {
    return { ...before, goodStreak: 0, status: 'learning', dueAt: ratedAt, lastRating: rating, lapseCount: before.lapseCount + 1 }
  }
  if (rating === 'fuzzy') {
    return { ...before, goodStreak: 0, status: 'learning', dueAt: ratedAt, lastRating: rating }
  }

  const goodStreak = before.goodStreak + 1
  return {
    ...before,
    goodStreak,
    status: goodStreak >= 3 ? 'stable' : 'learning',
    dueAt: goodStreak === 1 ? ratedAt : goodStreak === 2 ? nextMorning(ratedAt) : null,
    lastRating: rating,
  }
}

export function nextMorning(isoDate: string): string {
  const date = new Date(isoDate)
  date.setHours(7, 0, 0, 0)
  if (date.getTime() <= new Date(isoDate).getTime()) date.setDate(date.getDate() + 1)
  return date.toISOString()
}

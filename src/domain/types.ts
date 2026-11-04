export type CardLevel = 'core' | 'advanced' | 'link'
export type CardKind = 'qa' | 'cloze' | 'evidence-purpose' | 'comparison' | 'correction' | 'follow-up' | 'summary'
export type Rating = 'again' | 'fuzzy' | 'good'
export type TrainingMode = 'course' | 'mixed' | 'rescue'

export interface SourceRef {
  label: string
  path: string
  locator?: string
}

export interface Card {
  id: string
  courseId: string
  chapterId: string
  level: CardLevel
  kind: CardKind
  prompt: string
  answer?: string
  answerPoints?: string[]
  followUps?: Array<{ prompt: string; answer: string }>
  checklist?: string[]
  redLine?: boolean
  tags: string[]
  sourceRefs: SourceRef[]
  estimatedSeconds: number
}

export interface Chapter {
  id: string
  title: string
}

export interface Course {
  id: string
  title: string
  description: string
  riskNote?: string
  chapters: Chapter[]
  cards: Card[]
}

export interface CourseContent {
  contentVersion: string
  status: 'verified' | 'demo'
  courses: Course[]
}

export type ReviewStatus = 'new' | 'learning' | 'stable'

export interface ReviewState {
  cardId: string
  goodStreak: number
  status: ReviewStatus
  dueAt: string | null
  lastRating?: Rating
  lapseCount: number
}

export interface Attempt {
  attemptId: string
  sessionId: string
  cardId: string
  courseId: string
  chapterId: string
  mode: TrainingMode
  rating: Rating
  revealedAt: string
  ratedAt: string
  responseMs: number
  before: ReviewState
  after: ReviewState
  elapsedSeconds?: number
  checklistPassed?: boolean
}

export interface StudySession {
  id: string
  startedAt: string
  endedAt?: string
  mode: TrainingMode
  courseId?: string
  chapterId?: string
  attemptIds: string[]
}

export interface ActiveRun {
  sessionId: string
  mode: TrainingMode
  courseId?: string
  chapterId?: string
  queue: string[]
  reentries: Record<string, number>
  startedAt: string
  endedAt?: string
}

export interface LearningState {
  schemaVersion: 1
  contentVersion: string
  progress: Record<string, ReviewState>
  attempts: Attempt[]
  sessions: StudySession[]
  activeRun: ActiveRun | null
  preferences: {
    includeAdvanced: boolean
    lastCourseId: string
    lastMode: TrainingMode
  }
}

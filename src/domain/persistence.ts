import { z } from 'zod'
import { createInitialState } from './scheduler'
import type { LearningState } from './types'

export const STORAGE_KEY = 'lili-interview-trainer:v1'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const reviewSchema = z.object({
  cardId: z.string(),
  goodStreak: z.number().int().nonnegative(),
  status: z.enum(['new', 'learning', 'stable']),
  dueAt: z.string().nullable(),
  lastRating: z.enum(['again', 'fuzzy', 'good']).optional(),
  lapseCount: z.number().int().nonnegative(),
})

const attemptSchema = z.object({
  attemptId: z.string(),
  sessionId: z.string(),
  cardId: z.string(),
  courseId: z.string(),
  chapterId: z.string(),
  mode: z.enum(['course', 'mixed', 'rescue']),
  rating: z.enum(['again', 'fuzzy', 'good']),
  revealedAt: z.string(),
  ratedAt: z.string(),
  responseMs: z.number().nonnegative(),
  before: reviewSchema,
  after: reviewSchema,
  elapsedSeconds: z.number().nonnegative().optional(),
  checklistPassed: z.boolean().optional(),
})

const sessionSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  mode: z.enum(['course', 'mixed', 'rescue']),
  courseId: z.string().optional(),
  chapterId: z.string().optional(),
  attemptIds: z.array(z.string()),
})

const runSchema = z.object({
  sessionId: z.string(),
  mode: z.enum(['course', 'mixed', 'rescue']),
  courseId: z.string().optional(),
  chapterId: z.string().optional(),
  queue: z.array(z.string()),
  reentries: z.record(z.string(), z.number().int().nonnegative()),
  startedAt: z.string(),
  endedAt: z.string().optional(),
})

const stateSchema = z.object({
  schemaVersion: z.literal(1),
  contentVersion: z.string(),
  progress: z.record(z.string(), reviewSchema),
  attempts: z.array(attemptSchema),
  sessions: z.array(sessionSchema),
  activeRun: runSchema.nullable(),
  preferences: z.object({
    includeAdvanced: z.boolean(),
    lastCourseId: z.string(),
    lastMode: z.enum(['course', 'mixed', 'rescue']),
  }),
})

export function exportBackup(state: LearningState, exportedAt: string): string {
  return JSON.stringify({ ...state, exportedAt }, null, 2)
}

export function parseBackup(json: string): LearningState {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('备份文件损坏：不是有效的 JSON。')
  }
  if (typeof value === 'object' && value !== null && 'schemaVersion' in value && value.schemaVersion !== 1) {
    throw new Error(`不支持的数据版本：${String(value.schemaVersion)}。`)
  }
  const result = stateSchema.safeParse(value)
  if (!result.success) throw new Error('备份文件损坏或字段不完整，未替换现有数据。')
  return result.data
}

export function loadLearningState(storage: StorageLike, contentVersion: string): { state: LearningState | null; error?: string } {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return { state: createInitialState(contentVersion) }
  try {
    const state = parseBackup(raw)
    return { state: { ...state, contentVersion } }
  } catch (error) {
    return { state: null, error: error instanceof Error ? error.message.replace('备份文件', '本地数据') : '本地数据损坏。' }
  }
}

export function saveLearningState(storage: StorageLike, state: LearningState): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state))
}

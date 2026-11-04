import { describe, expect, it, vi } from 'vitest'
import { createInitialState } from './scheduler'
import { exportBackup, loadLearningState, parseBackup, saveLearningState, STORAGE_KEY } from './persistence'

describe('local persistence and backup', () => {
  it('round-trips progress, attempts, sessions and active queue', () => {
    const state = createInitialState('content-1')
    state.activeRun = { sessionId: 's1', mode: 'course', queue: ['card-1'], reentries: {}, startedAt: '2026-11-04T08:00:00.000Z' }
    state.sessions = [{ id: 's1', startedAt: '2026-11-04T08:00:00.000Z', mode: 'course', attemptIds: [] }]
    const restored = parseBackup(exportBackup(state, '2026-11-04T09:00:00.000Z'))
    expect(restored).toEqual(state)
  })

  it('saves and restores the same state without duplicate attempts', () => {
    const state = createInitialState('content-1')
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
    saveLearningState(storage, state)
    storage.getItem.mockReturnValue(storage.setItem.mock.calls[0][1])
    const result = loadLearningState(storage, 'content-1')
    expect(result.state).toEqual(state)
    expect(storage.getItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('reports corrupt data without silently overwriting it', () => {
    const storage = { getItem: vi.fn(() => '{broken'), setItem: vi.fn(), removeItem: vi.fn() }
    const result = loadLearningState(storage, 'content-1')
    expect(result.state).toBeNull()
    expect(result.error).toContain('损坏')
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('rejects unsupported future schema versions explicitly', () => {
    expect(() => parseBackup(JSON.stringify({ schemaVersion: 99 }))).toThrow('不支持')
  })
})

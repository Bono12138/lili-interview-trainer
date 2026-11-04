import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { courseContent } from './content'
import { exportBackup } from './domain/persistence'
import { createInitialState } from './domain/scheduler'

function memoryStorage(initial?: string) {
  const data = new Map<string, string>()
  if (initial) data.set('lili-interview-trainer:v1', initial)
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  }
}

describe('backup UI', () => {
  it('validates and confirms before replacing local records', async () => {
    const user = userEvent.setup()
    const storage = memoryStorage()
    const imported = createInitialState('old-content')
    imported.progress['card-1'] = { cardId: 'card-1', goodStreak: 3, status: 'stable', dueAt: null, lastRating: 'good', lapseCount: 0 }
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App content={courseContent} storage={storage} />)

    await user.upload(screen.getByLabelText('选择备份文件'), new File([exportBackup(imported, '2026-11-04T09:00:00.000Z')], 'backup.json', { type: 'application/json' }))

    await waitFor(() => expect(JSON.parse(storage.getItem('lili-interview-trainer:v1')!).progress['card-1'].status).toBe('stable'))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('替换'))
    expect(JSON.parse(storage.getItem('lili-interview-trainer:v1')!).contentVersion).toBe(courseContent.contentVersion)
    confirm.mockRestore()
  })

  it('keeps existing records when import is cancelled', async () => {
    const user = userEvent.setup()
    const storage = memoryStorage()
    const imported = createInitialState('old-content')
    imported.progress['card-1'] = { cardId: 'card-1', goodStreak: 3, status: 'stable', dueAt: null, lastRating: 'good', lapseCount: 0 }
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App content={courseContent} storage={storage} />)
    const before = storage.getItem('lili-interview-trainer:v1')

    await user.upload(screen.getByLabelText('选择备份文件'), new File([exportBackup(imported, '2026-11-04T09:00:00.000Z')], 'backup.json'))

    expect(confirm).toHaveBeenCalled()
    expect(storage.getItem('lili-interview-trainer:v1')).toBe(before)
    confirm.mockRestore()
  })

  it('shows recovery choices for corrupt storage without overwriting it', () => {
    const storage = memoryStorage('{broken')
    render(<App content={courseContent} storage={storage} />)
    expect(screen.getByRole('heading', { name: '学习记录暂时无法读取' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认清除并重新开始' })).toBeInTheDocument()
    expect(storage.getItem('lili-interview-trainer:v1')).toBe('{broken')
  })
})

import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import type { Card, CourseContent } from './domain/types'
import { STORAGE_KEY } from './domain/persistence'

const chapters = [
  ['case-map', '案件地图'],
  ['evidence-contribution', '证据与本人工作'],
  ['legal-issues', '法律争点'],
  ['review-comparison', '复盘与关联案件'],
  ['interview-performance', '面试表达与压力追问'],
] as const

const cards: Card[] = [
  { id: 'core-1', courseId: 'return-property', chapterId: 'case-map', level: 'core', kind: 'qa', prompt: '第一张核心卡', answer: '第一张答案', tags: [], sourceRefs: [{ label: '判决', path: '材料.pdf' }], estimatedSeconds: 15 },
  { id: 'core-2', courseId: 'return-property', chapterId: 'case-map', level: 'core', kind: 'cloze', prompt: '第二张核心卡', answer: '第二张答案', tags: [], sourceRefs: [{ label: '判决', path: '材料.pdf' }], estimatedSeconds: 15 },
  { id: 'check-1', courseId: 'return-property', chapterId: 'case-map', level: 'advanced', kind: 'follow-up', prompt: '换问法检查卡', answer: '检查答案', followUps: [{ prompt: '追加追问', answer: '追问答案' }], tags: [], sourceRefs: [{ label: '判决', path: '材料.pdf' }], estimatedSeconds: 20 },
  { id: 'summary-1', courseId: 'return-property', chapterId: 'interview-performance', level: 'link', kind: 'summary', prompt: '90 秒整案陈述', checklist: ['事实完整', '证据清楚', '结果准确'], tags: [], sourceRefs: [{ label: '判决', path: '材料.pdf' }], estimatedSeconds: 90 },
]

const content: CourseContent = {
  contentVersion: 'test-content',
  status: 'demo',
  courses: [{ id: 'return-property', title: '返还原物纠纷', description: '测试课程', chapters: chapters.map(([id, title]) => ({ id, title })), cards }],
}

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  }
}

async function startCore(user: ReturnType<typeof userEvent.setup>, storage = memoryStorage()) {
  const utils = render(<App content={content} storage={storage} />)
  await user.click(screen.getByRole('button', { name: '案件课程' }))
  await user.click(screen.getByRole('button', { name: /返还原物纠纷/ }))
  await user.click(screen.getByRole('button', { name: '核心学习' }))
  return { ...utils, storage }
}

describe('study interaction', () => {
  it('reveals with Space or ArrowDown and never rates before reveal', async () => {
    const user = userEvent.setup()
    const { storage } = await startCore(user)
    expect(screen.getByText('第一张核心卡')).toBeInTheDocument()
    expect(screen.queryByText('第一张答案')).not.toBeInTheDocument()

    await user.keyboard('{ArrowLeft}{ArrowRight}')
    expect(screen.getByText('第一张核心卡')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '会' })).not.toBeInTheDocument()

    await user.keyboard('{Space}')
    expect(screen.getByText('第一张答案')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '不会' })).toBeInTheDocument()
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).attempts).toHaveLength(0)
  })

  it('rates again by touch, moves to another card and reenters the weak card', async () => {
    const user = userEvent.setup()
    await startCore(user)
    await user.click(screen.getByRole('button', { name: '显示答案' }))
    await user.click(screen.getByRole('button', { name: '不会' }))
    expect(screen.getByText('第二张核心卡')).toBeInTheDocument()
    expect(screen.getByText(/队列稍后重现/)).toBeInTheDocument()
  })

  it('supports fuzzy and good keyboard ratings and a complete immutable undo', async () => {
    const user = userEvent.setup()
    const { storage } = await startCore(user)
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowRight}')
    expect(screen.getByText('第二张核心卡')).toBeInTheDocument()
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).attempts).toHaveLength(1)

    await user.keyboard('{Control>}z{/Control}')
    expect(screen.getByText('第一张核心卡')).toBeInTheDocument()
    expect(screen.getByText('第一张答案')).toBeInTheDocument()
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).attempts).toHaveLength(0)

    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowDown}')
    expect(screen.getByText('第二张核心卡')).toBeInTheDocument()
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).attempts[0].rating).toBe('fuzzy')
  })

  it('restores queue and records after remount without duplicate attempts', async () => {
    const user = userEvent.setup()
    const { storage, unmount } = await startCore(user)
    await user.keyboard('{Space}{ArrowRight}')
    unmount()
    render(<App content={content} storage={storage} />)
    await screen.findByText('第二张核心卡')
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).attempts).toHaveLength(1)
  })

  it('uses a different kind for chapter checks', async () => {
    const user = userEvent.setup()
    render(<App content={content} storage={memoryStorage()} />)
    await user.click(screen.getByRole('button', { name: '案件课程' }))
    await user.click(screen.getByRole('button', { name: /返还原物纠纷/ }))
    await user.click(screen.getByRole('button', { name: '章节检查' }))
    expect(screen.getByText('换问法检查卡')).toBeInTheDocument()
    await user.keyboard('{Space}')
    expect(screen.getByText(/追加追问/)).toBeInTheDocument()
  })

  it('starts, pauses and resets a summary timer and records manual checklist completion', () => {
    vi.useFakeTimers()
    const storage = memoryStorage()
    render(<App content={content} storage={storage} />)
    fireEvent.click(screen.getByRole('button', { name: '案件课程' }))
    fireEvent.click(screen.getByRole('button', { name: /返还原物纠纷/ }))
    fireEvent.click(screen.getByRole('button', { name: '串联表达' }))
    fireEvent.click(screen.getByRole('button', { name: '开始计时' }))
    act(() => { vi.advanceTimersByTime(3000) })
    fireEvent.click(screen.getByRole('button', { name: '暂停计时' }))
    expect(screen.getByText('00:03')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重置计时' }))
    expect(screen.getByText('00:00')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '显示核对点' }))
    fireEvent.click(screen.getByLabelText('事实完整'))
    fireEvent.click(screen.getByLabelText('证据清楚'))
    fireEvent.click(screen.getByLabelText('结果准确'))
    fireEvent.click(screen.getByRole('button', { name: '核对通过并完成' }))
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).attempts[0]).toMatchObject({ checklistPassed: true, elapsedSeconds: 0 })
    vi.useRealTimers()
  })
})


describe('advanced preference', () => {
  it('lets the user include advanced cards in core study', async () => {
    const user = userEvent.setup()
    render(<App content={content} storage={memoryStorage()} />)
    await user.click(screen.getByRole('button', { name: '案件课程' }))
    await user.click(screen.getByRole('button', { name: /返还原物纠纷/ }))
    await user.click(screen.getByRole('checkbox', { name: '包含进阶卡' }))
    await user.click(screen.getByRole('button', { name: '核心学习' }))
    await user.keyboard('{Space}{ArrowRight}{Space}{ArrowRight}')
    expect(screen.getByText('换问法检查卡')).toBeInTheDocument()
  })
})


describe('chapter check feedback', () => {
  it('names the specific weak card after a failed check instead of forcing a whole chapter restart', async () => {
    const user = userEvent.setup()
    render(<App content={content} storage={memoryStorage()} />)
    await user.click(screen.getByRole('button', { name: '案件课程' }))
    await user.click(screen.getByRole('button', { name: /返还原物纠纷/ }))
    await user.click(screen.getByRole('button', { name: '章节检查' }))
    await user.keyboard('{Space}{ArrowLeft}{Space}{ArrowLeft}{Space}{ArrowLeft}')
    expect(screen.getByText('本轮完成')).toBeInTheDocument()
    expect(screen.getByText('换问法检查卡')).toBeInTheDocument()
    expect(screen.getByText(/需要重点巩固/)).toBeInTheDocument()
  })
})

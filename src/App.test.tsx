import { act, fireEvent, render, screen, within } from '@testing-library/react'
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
  it('reveals without rating and supports direct keyboard ratings', async () => {
    const user = userEvent.setup()
    const { storage } = await startCore(user)
    await user.keyboard('{Space}')
    expect(screen.getByText('第一张答案')).toBeInTheDocument()
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).attempts).toHaveLength(0)
    await user.keyboard('{ArrowRight}')
    await user.keyboard('{ArrowLeft}')
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).attempts.map((a: {rating: string}) => a.rating)).toEqual(['good', 'again'])
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

describe('navigation regressions', () => {
  it('returns to the actual case map and resumes the same session from home', async () => {
    const user = userEvent.setup()
    const { storage } = await startCore(user)
    await user.click(screen.getByRole('button', { name: '会' }))
    const session = JSON.parse(storage.getItem(STORAGE_KEY)!).activeRun.sessionId
    await user.click(screen.getByRole('button', { name: /返回案件地图/ }))
    expect(screen.getByRole('button', { name: '核心学习' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '今日' }))
    await user.click(screen.getByRole('button', { name: /继续学习/ }))
    expect(screen.getByText('第二张核心卡')).toBeInTheDocument()
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).activeRun.sessionId).toBe(session)
  })

  it('allows undo after the last card and preserves summary checklist/timer', async () => {
    const user = userEvent.setup()
    const { storage } = await startCore(user)
    await user.click(screen.getByRole('button', { name: /返回案件地图/ }))
    await user.click(screen.getByRole('button', { name: '串联表达' }))
    await user.click(screen.getByRole('button', { name: '显示核对点' }))
    for (const label of ['事实完整', '证据清楚', '结果准确']) await user.click(screen.getByLabelText(label))
    await user.click(screen.getByRole('button', { name: '核对通过并完成' }))
    await user.click(screen.getByRole('button', { name: /撤销评分/ }))
    expect(screen.getByLabelText('事实完整')).toBeChecked()
    expect(screen.getByRole('button', { name: '核对通过并完成' })).toBeEnabled()
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).attempts).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: '核对通过并完成' }))
    await user.click(screen.getByRole('button', { name: '再来一轮' }))
    expect(screen.getByText('90 秒整案陈述')).toBeInTheDocument()
  })

  it('does not hijack Space on a focused navigation button or held rating key', async () => {
    const user = userEvent.setup()
    const { storage } = await startCore(user)
    const back = screen.getByRole('button', { name: /返回案件地图/ })
    back.focus()
    await user.keyboard(' ')
    expect(screen.getByRole('button', { name: '核心学习' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '核心学习' }))
    fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true })
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).attempts).toHaveLength(0)
  })

  it.each(['混合复习', '错卡急救'])('%s includes cards in other courses', async (mode) => {
    const user = userEvent.setup()
    const storage = memoryStorage()
    const extra = { ...content.courses[0], id: 'labor-arbitration', title: '劳动案', cards: [{ ...cards[0], id: 'other-1', courseId: 'labor-arbitration', prompt: '另一案题面' }] }
    render(<App content={{ ...content, courses: [...content.courses, extra] }} storage={storage} />)
    await user.click(screen.getByRole('button', { name: '案件课程' }))
    await user.click(screen.getByRole('button', { name: /劳动案/ }))
    await user.click(screen.getByRole('button', { name: '核心学习' }))
    await user.click(screen.getByRole('button', { name: '不会' }))
    await user.click(screen.getByRole('button', { name: mode }))
    expect(screen.getByText('另一案题面')).toBeInTheDocument()
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).activeRun.courseId).toBeUndefined()
  })
})

describe('summary safety', () => {
  it('never scores a summary by arrows or swipes, and pauses when navigating away', () => {
    vi.useFakeTimers()
    const storage = memoryStorage()
    render(<App content={content} storage={storage} />)
    fireEvent.click(screen.getByRole('button', { name: '案件课程' }))
    fireEvent.click(screen.getByRole('button', { name: /返还原物纠纷/ }))
    fireEvent.click(screen.getByRole('button', { name: '串联表达' }))
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    const card = screen.getByRole('article')
    fireEvent.touchStart(card, { touches: [{ clientX: 200, clientY: 200 }] })
    fireEvent.touchEnd(card, { touches: [], changedTouches: [{ clientX: 60, clientY: 200 }] })
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).attempts).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: '开始计时' }))
    act(() => vi.advanceTimersByTime(2000))
    fireEvent.click(screen.getByRole('button', { name: '成长记录' }))
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(5000))
    fireEvent.click(screen.getByRole('button', { name: '今日' }))
    fireEvent.click(screen.getByRole('button', { name: /继续学习/ }))
    expect(screen.getByRole('button', { name: '开始计时' })).toBeInTheDocument()
    vi.useRealTimers()
  })
})

describe('completion navigation', () => {
  it('returns home from completion and shows the full library from view-all', async () => {
    const user = userEvent.setup()
    await startCore(user)
    await user.keyboard('{ArrowRight}{ArrowRight}')
    await user.click(within(screen.getByText('本轮完成').closest('section')!).getByRole('button', { name: '返回今日首页' }))
    expect(screen.getByRole('heading', { name: '今天，再向前一步。' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /查看全部/ }))
    expect(screen.getByRole('heading', { name: '案件课程' })).toBeInTheDocument()
  })
})

describe('motivating and actionable progress', () => {
  it('tracks distinct daily practice, rewards mistakes honestly and restores rewards on undo', async () => {
    const user = userEvent.setup()
    const { storage } = await startCore(user)
    expect(screen.getByRole('progressbar', { name: '本轮进度' })).toHaveAttribute('aria-valuenow', '0')
    await user.click(screen.getByRole('button', { name: '不会' }))
    expect(screen.getByRole('status')).toHaveTextContent('+5 练习值')
    expect(screen.getByRole('progressbar', { name: '本轮进度' })).toHaveAttribute('aria-valuenow', '1')
    await user.click(screen.getByRole('button', { name: /撤销评分/ }))
    await user.click(screen.getByRole('button', { name: '今日' }))
    expect(screen.getByRole('progressbar', { name: '今日练习目标' })).toHaveAttribute('aria-valuenow', '0')
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).attempts).toHaveLength(0)
  })
  it('shows readiness above the course list and starts the suggested exact practice', async () => {
    const user = userEvent.setup()
    render(<App content={content} storage={memoryStorage()} />)
    expect(screen.getByRole('progressbar', { name: '训练准备进度' })).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByRole('button', { name: '继续核心回忆' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '继续核心回忆' }))
    expect(screen.getByText('第一张核心卡')).toBeInTheDocument()
  })
  it('exposes data tools using a compact mobile toggle without duplicating export controls', async () => {
    const user = userEvent.setup()
    render(<App content={content} storage={memoryStorage()} />)
    const toggle = screen.getByRole('button', { name: '学习数据与备份' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('button', { name: '导出学习备份' })).toHaveLength(1)
  })
})

describe('compact navigation state', () => {
  it('closes the backup menu on navigation and identifies the current training mode', async () => {
    const user = userEvent.setup()
    render(<App content={content} storage={memoryStorage()} />)
    await user.click(screen.getByRole('button', { name: '学习数据与备份' }))
    await user.click(screen.getByRole('button', { name: '案件课程' }))
    expect(screen.getByRole('button', { name: '学习数据与备份' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: '案件课程' })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('button', { name: '混合复习' }))
    expect(screen.getByRole('button', { name: '混合复习' })).toHaveAttribute('aria-current', 'page')
  })
})

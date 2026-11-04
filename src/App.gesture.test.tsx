import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './domain/persistence'
import type { CourseContent } from './domain/types'

const content: CourseContent = {
  contentVersion: 'gesture-test',
  status: 'demo',
  courses: [{
    id: 'return-property',
    title: '返还原物纠纷',
    description: '手势测试',
    chapters: [
      { id: 'case-map', title: '案件地图' },
      { id: 'evidence-contribution', title: '证据与本人工作' },
      { id: 'legal-issues', title: '法律争点' },
      { id: 'review-comparison', title: '复盘与关联案件' },
      { id: 'interview-performance', title: '面试表达与压力追问' },
    ],
    cards: [
      { id: 'card-1', courseId: 'return-property', chapterId: 'case-map', level: 'core', kind: 'qa', prompt: '第一张题面', answer: '第一张答案', tags: [], sourceRefs: [{ label: '材料', path: '材料.pdf' }], estimatedSeconds: 15 },
      { id: 'card-2', courseId: 'return-property', chapterId: 'case-map', level: 'core', kind: 'qa', prompt: '第二张题面', answer: '第二张答案', tags: [], sourceRefs: [{ label: '材料', path: '材料.pdf' }], estimatedSeconds: 15 },
    ],
  }],
}

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  }
}

async function startStudy() {
  const user = userEvent.setup()
  const storage = memoryStorage()
  render(<App content={content} storage={storage} />)
  await user.click(screen.getByRole('button', { name: '案件课程' }))
  await user.click(screen.getByRole('button', { name: /返还原物纠纷/ }))
  await user.click(screen.getByRole('button', { name: '核心学习' }))
  return { user, storage }
}

function swipe(fromX: number, fromY: number, toX: number, toY: number) {
  const card = screen.getByRole('article')
  fireEvent.touchStart(card, { touches: [{ clientX: fromX, clientY: fromY }] })
  fireEvent.touchEnd(card, { changedTouches: [{ clientX: toX, clientY: toY }] })
}

describe('touch gestures', () => {
  it('reveals on swipe down but ignores left and right before reveal', async () => {
    const { storage } = await startStudy()
    swipe(200, 200, 80, 200)
    swipe(200, 200, 320, 200)
    expect(screen.queryByText('第一张答案')).not.toBeInTheDocument()
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).attempts).toHaveLength(0)
    swipe(200, 160, 200, 300)
    expect(screen.getByText('第一张答案')).toBeInTheDocument()
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).attempts).toHaveLength(0)
  })

  it.each([
    ['left', 'again', 200, 200, 60, 200],
    ['right', 'good', 60, 200, 220, 200],
    ['down', 'fuzzy', 200, 150, 200, 310],
  ])('rates %s with the same domain result as buttons', async (_direction, rating, fromX, fromY, toX, toY) => {
    const { user, storage } = await startStudy()
    await user.click(screen.getByRole('button', { name: '显示答案' }))
    swipe(fromX, fromY, toX, toY)
    expect(screen.getByText('第二张题面')).toBeInTheDocument()
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).attempts[0].rating).toBe(rating)
  })

  it('does not rate small taps or diagonal scrolling', async () => {
    const { user, storage } = await startStudy()
    await user.click(screen.getByRole('button', { name: '显示答案' }))
    swipe(200, 200, 215, 220)
    expect(screen.getByText('第一张题面')).toBeInTheDocument()
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).attempts).toHaveLength(0)
  })
})

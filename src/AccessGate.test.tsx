import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import AccessGate, { ACCESS_KEY, hashPassword } from './AccessGate'

const password = 'test-password'
let passwordHash = ''

beforeEach(async () => {
  passwordHash = await hashPassword(password)
})

describe('AccessGate', () => {
  it('does not expose course content before the correct password', async () => {
    const user = userEvent.setup()
    render(<AccessGate passwordHash={passwordHash}><p>训练内容</p></AccessGate>)
    expect(screen.queryByText('训练内容')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('访问密码'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: '进入训练器' }))
    expect(screen.getByRole('alert')).toHaveTextContent('密码不正确')
    expect(screen.queryByText('训练内容')).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('访问密码'))
    await user.type(screen.getByLabelText('访问密码'), password)
    await user.click(screen.getByRole('button', { name: '进入训练器' }))
    expect(screen.getByText('训练内容')).toBeInTheDocument()
    expect(window.localStorage.getItem(ACCESS_KEY)).toBe('granted')
  })

  it('remembers access after refresh without touching learning data', () => {
    window.localStorage.setItem(ACCESS_KEY, 'granted')
    window.localStorage.setItem('lili-interview-trainer:v1', 'learning-data')
    render(<AccessGate passwordHash={passwordHash}><p>训练内容</p></AccessGate>)
    expect(screen.getByText('训练内容')).toBeInTheDocument()
    expect(window.localStorage.getItem('lili-interview-trainer:v1')).toBe('learning-data')
  })
})

import { useState, type FormEvent, type ReactNode } from 'react'

export const ACCESS_KEY = 'lili-interview-trainer:access'
const PASSWORD_HASH = '7f8da0ed1197441ff9cd423dd6f3b7db4c6f5212d8910f3ce90552ba2560f294'

export async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export default function AccessGate({ children, passwordHash = PASSWORD_HASH }: { children: ReactNode; passwordHash?: string }) {
  const [unlocked, setUnlocked] = useState(() => window.localStorage.getItem(ACCESS_KEY) === 'granted')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setChecking(true)
    setError('')
    try {
      if (await hashPassword(password) !== passwordHash) {
        setError('密码不正确，请重试。')
        return
      }
      window.localStorage.setItem(ACCESS_KEY, 'granted')
      setUnlocked(true)
    } catch {
      setError('当前浏览器无法验证密码，请使用最新版 Safari 或 Chrome。')
    } finally {
      setChecking(false)
    }
  }

  if (unlocked) return children

  return (
    <main className="access-shell">
      <section className="access-card">
        <span className="brand-mark">黎</span>
        <p className="eyebrow">PRIVATE STUDY SPACE</p>
        <h1>李黎面试训练器</h1>
        <p>输入访问密码，开始今天的训练。</p>
        <form onSubmit={submit}>
          <label htmlFor="access-password">访问密码</label>
          <input id="access-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus autoComplete="current-password" required />
          {error && <p role="alert" className="error-text">{error}</p>}
          <button className="primary-button" type="submit" disabled={checking}>{checking ? '正在验证…' : '进入训练器'}</button>
        </form>
        <small>学习内容仅保存在当前浏览器，请定期导出备份。</small>
      </section>
    </main>
  )
}

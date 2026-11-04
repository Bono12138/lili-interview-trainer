import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { courseContent } from './content'
import { buildQueue, getChapterPerformance, getDashboardStats, getReadiness, isRescueCard } from './domain/progress'
import { exportBackup, loadLearningState, parseBackup, saveLearningState, STORAGE_KEY, type StorageLike } from './domain/persistence'
import { createRun, rateCard } from './domain/scheduler'
import type { Card, Course, CourseContent, LearningState, Rating, TrainingMode } from './domain/types'

type View = 'dashboard' | 'courses' | 'course' | 'study' | 'growth'
type CardSet = 'core' | 'assessment' | 'link' | 'advanced'

interface AppProps {
  content?: CourseContent
  storage?: StorageLike
  now?: () => Date
}

const kindLabels: Record<Card['kind'], string> = {
  qa: '问答', cloze: '填空', 'evidence-purpose': '证据目的', comparison: '比较', correction: '纠错', 'follow-up': '压力追问', summary: '案件陈述',
}

const modeLabels: Record<TrainingMode, string> = { course: '逐案学习', mixed: '混合复习', rescue: '错卡急救' }

export default function App({ content = courseContent, storage = window.localStorage, now = () => new Date() }: AppProps) {
  const cards = useMemo(() => content.courses.flatMap((course) => course.cards), [content])
  const cardById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards])
  const [initial] = useState(() => loadLearningState(storage, content.contentVersion))
  const [state, setState] = useState<LearningState | null>(initial.state)
  const [view, setView] = useState<View>(initial.state?.activeRun && !initial.state.activeRun.endedAt ? 'study' : 'dashboard')
  const [selectedCourseId, setSelectedCourseId] = useState(initial.state?.preferences.lastCourseId ?? content.courses[0]?.id ?? '')
  const [selectedChapterId, setSelectedChapterId] = useState('case-map')
  const [revealed, setRevealed] = useState(false)
  const [revealedAt, setRevealedAt] = useState<string>('')
  const [undoSnapshot, setUndoSnapshot] = useState<LearningState | null>(null)
  const [notice, setNotice] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [checkedPoints, setCheckedPoints] = useState<number[]>([])
  const [importError, setImportError] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  const selectedCourse = content.courses.find((course) => course.id === selectedCourseId) ?? content.courses[0]
  const currentCard = state?.activeRun?.queue[0] ? cardById.get(state.activeRun.queue[0]) : undefined
  const currentCourse = content.courses.find((course) => course.id === currentCard?.courseId)

  useEffect(() => {
    if (state) saveLearningState(storage, state)
  }, [state, storage])

  useEffect(() => {
    if (!timerRunning) return
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [timerRunning])

  const resetCardInteraction = useCallback(() => {
    setRevealed(false)
    setRevealedAt('')
    setElapsed(0)
    setTimerRunning(false)
    setCheckedPoints([])
    setNotice('')
  }, [])

  const reveal = useCallback(() => {
    if (revealed || !currentCard) return
    setRevealedAt(now().toISOString())
    setRevealed(true)
  }, [currentCard, now, revealed])

  const rate = useCallback((rating: Rating, checklistPassed?: boolean) => {
    if (!state || !currentCard || !revealed) return
    setUndoSnapshot(state)
    const next = rateCard(state, currentCard, {
      rating,
      revealedAt: revealedAt || now().toISOString(),
      ratedAt: now().toISOString(),
      ...(currentCard.kind === 'summary' ? { elapsedSeconds: elapsed, checklistPassed: checklistPassed ?? checkedPoints.length === (currentCard.checklist?.length ?? 0) } : {}),
    })
    setState(next)
    setRevealed(false)
    setRevealedAt('')
    setElapsed(0)
    setTimerRunning(false)
    setCheckedPoints([])
    setNotice(rating === 'good' ? '已记录为「会」' : `已记录，队列稍后重现`)
  }, [checkedPoints.length, currentCard, elapsed, now, revealed, revealedAt, state])

  const undo = useCallback(() => {
    if (!undoSnapshot) return
    setState(undoSnapshot)
    setUndoSnapshot(null)
    setRevealed(true)
    setNotice('已撤销最近一次评分')
  }, [undoSnapshot])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (!event.repeat) undo()
        return
      }
      if (view !== 'study' || !currentCard || event.repeat) return
      if (event.code === 'Space' || event.key === ' ' || event.key === 'Space' || event.key === 'ArrowDown') {
        event.preventDefault()
        if (!revealed) reveal()
        else if (event.key === 'ArrowDown' && currentCard.kind !== 'summary') rate('fuzzy')
      } else if (revealed && currentCard.kind !== 'summary' && event.key === 'ArrowLeft') {
        event.preventDefault()
        rate('again')
      } else if (revealed && currentCard.kind !== 'summary' && event.key === 'ArrowRight') {
        event.preventDefault()
        rate('good')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [currentCard, rate, reveal, revealed, undo, view])

  function openCourse(course: Course) {
    setSelectedCourseId(course.id)
    setSelectedChapterId('case-map')
    setView('course')
  }

  function startRun(mode: TrainingMode, set: CardSet = 'core', courseId = selectedCourse?.id, chapterId?: string) {
    if (!state) return
    const startedAt = now().toISOString()
    const queue = buildQueue(cards, state, {
      mode,
      courseId,
      chapterId,
      set,
      includeAdvanced: state.preferences.includeAdvanced,
      now: startedAt,
    })
    const next = createRun(state, {
      sessionId: `session-${startedAt}-${state.sessions.length + 1}`,
      mode,
      courseId,
      chapterId,
      queue,
      startedAt,
    })
    setState(next)
    setUndoSnapshot(null)
    resetCardInteraction()
    setView('study')
  }

  function goDashboard() {
    setView('dashboard')
    resetCardInteraction()
  }

  async function importBackup(file: File) {
    setImportError('')
    try {
      const text = typeof file.text === 'function' ? await file.text() : await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsText(file)
      })
      const imported = parseBackup(text)
      if (!window.confirm('导入将替换本机现有学习记录。确认继续吗？')) return
      setUndoSnapshot(null)
      setState({ ...imported, contentVersion: content.contentVersion })
      setView(imported.activeRun && !imported.activeRun.endedAt ? 'study' : 'dashboard')
      resetCardInteraction()
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '导入失败。')
    }
  }

  function downloadBackup() {
    if (!state) return
    const blob = new Blob([exportBackup(state, now().toISOString())], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `lili-interview-backup-${now().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (!state) {
    return (
      <main className="recovery-shell">
        <p className="eyebrow">本地数据恢复</p>
        <h1>学习记录暂时无法读取</h1>
        <p>{initial.error}</p>
        <p>现有数据没有被覆盖。你可以先备份浏览器中的原始数据，或确认后重新开始。</p>
        <button className="primary-button" onClick={() => {
          if (window.confirm('确认清除损坏的本地记录并重新开始吗？此操作不可撤销。')) {
            storage.removeItem(STORAGE_KEY)
            setState(loadLearningState(storage, content.contentVersion).state)
          }
        }}>确认清除并重新开始</button>
      </main>
    )
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <button className="brand" onClick={goDashboard} aria-label="返回今日首页">
          <span className="brand-mark">黎</span>
          <span><strong>李黎</strong><small>面试训练器</small></span>
        </button>
        <nav className="main-nav" aria-label="主导航">
          <button aria-label="今日" className={view === 'dashboard' ? 'active' : ''} onClick={goDashboard}><span>⌂</span>今日</button>
          <button aria-label="案件课程" className={view === 'courses' || view === 'course' ? 'active' : ''} onClick={() => setView('courses')}><span>▤</span>案件课程</button>
          <button aria-label="混合复习" onClick={() => startRun('mixed')}><span>⤨</span>混合复习</button>
          <button aria-label="错卡急救" onClick={() => startRun('rescue')}><span>!</span>错卡急救</button>
          <button aria-label="成长记录" className={view === 'growth' ? 'active' : ''} onClick={() => setView('growth')}><span>↗</span>成长记录</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status"><span className="status-dot" />数据仅保存在本机</div>
          <button className="text-button" onClick={downloadBackup}>导出学习备份</button>
          <button className="text-button" onClick={() => importRef.current?.click()}>导入 JSON 备份</button>
          <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" aria-label="选择备份文件" onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void importBackup(file)
            event.target.value = ''
          }} />
          {importError && <p role="alert" className="error-text">{importError}</p>}
        </div>
      </aside>

      <main className="main-content">
        {content.status === 'demo' && <div className="content-banner">当前含演示课程，仅用于流程训练；正式案件表述请以核验材料为准。</div>}
        {view === 'dashboard' && <Dashboard content={content} state={state} now={now().toISOString()} onCourse={openCourse} onStart={() => startRun('course', 'core', selectedCourse?.id)} onMixed={() => startRun('mixed')} onRescue={() => startRun('rescue')} />}
        {view === 'courses' && <CourseLibrary content={content} state={state} onCourse={openCourse} />}
        {view === 'course' && selectedCourse && <>
          <label className="advanced-toggle"><input type="checkbox" checked={state.preferences.includeAdvanced} onChange={(event) => setState({ ...state, preferences: { ...state.preferences, includeAdvanced: event.target.checked } })} />包含进阶卡</label>
          <CourseDetail course={selectedCourse} state={state} chapterId={selectedChapterId} onChapter={setSelectedChapterId} onBack={() => setView('courses')} onStart={(set, chapterId) => startRun('course', set, selectedCourse.id, chapterId)} />
        </>}
        {view === 'study' && (
          <StudyView
            state={state}
            cards={cards}
            card={currentCard}
            course={currentCourse}
            revealed={revealed}
            notice={notice}
            canUndo={Boolean(undoSnapshot)}
            elapsed={elapsed}
            timerRunning={timerRunning}
            checkedPoints={checkedPoints}
            onBack={goDashboard}
            onReveal={reveal}
            onRate={rate}
            onUndo={undo}
            onTimer={() => setTimerRunning((value) => !value)}
            onResetTimer={() => { setTimerRunning(false); setElapsed(0) }}
            onCheck={(index) => setCheckedPoints((points) => points.includes(index) ? points.filter((point) => point !== index) : [...points, index])}
            onRetry={() => startRun(state.activeRun?.mode ?? 'course', 'core', state.activeRun?.courseId, state.activeRun?.chapterId)}
          />
        )}
        {view === 'growth' && <GrowthView content={content} state={state} />}
      </main>
    </div>
  )
}

function Dashboard({ content, state, now, onCourse, onStart, onMixed, onRescue }: { content: CourseContent; state: LearningState; now: string; onCourse: (course: Course) => void; onStart: () => void; onMixed: () => void; onRescue: () => void }) {
  const cards = content.courses.flatMap((course) => course.cards)
  const stats = getDashboardStats(cards, state, now)
  const readiness = getReadiness(cards, state)
  const chapterPerformance = getChapterPerformance(state)
  const recentSession = state.sessions.at(-1)
  const recentCourse = content.courses.find((course) => course.id === state.preferences.lastCourseId) ?? content.courses[0]
  const recentCore = recentCourse.cards.filter((card) => card.level === 'core')
  const learned = recentCore.filter((card) => state.progress[card.id]).length
  const rescueCount = cards.filter((card) => isRescueCard(state, card.id)).length
  const date = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(now))

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">{date}</p><h1>今天，再向前一步。</h1><p>把案件讲清楚，把每一个不确定变成确定。</p></div>
        <button className="primary-button" onClick={onStart}>继续学习 <span>→</span></button>
      </header>
      <section className="metric-grid" aria-label="学习概览">
        <Metric label="今日待复习" value={stats.due} suffix="张" accent />
        <Metric label="学习中" value={stats.learning} suffix="张" />
        <Metric label="已稳定" value={stats.stable} suffix="张" />
        <Metric label="未学习" value={stats.fresh} suffix="张" />
      </section>
      <div className="dashboard-grid">
        <div className="dashboard-main-column">
          <section className="panel continue-panel">
            <div className="section-heading"><div><p className="eyebrow">继续上次学习</p><h2>{recentCourse.title}</h2></div><span className="soft-badge">{recentCore.length} 张核心卡</span></div>
            <p>{recentCourse.description}</p>
            <div className="progress-label"><span>核心卡进度</span><strong>{learned} / {recentCore.length}</strong></div>
            <div className="progress-track"><span style={{ width: `${recentCore.length ? learned / recentCore.length * 100 : 0}%` }} /></div>
            <div className="button-row"><button className="primary-button" onClick={onStart}>从核心卡开始</button><button className="secondary-button" onClick={() => onCourse(recentCourse)}>查看案件地图</button></div>
          </section>
          <section className="panel">
            <div className="section-heading"><div><p className="eyebrow">训练模式</p><h2>按今天的状态选择</h2></div></div>
            <div className="mode-grid">
              <button className="mode-card" onClick={onMixed}><span className="mode-icon">⤨</span><strong>混合复习</strong><small>跨案件切换，优先到期卡</small><span>开始训练 →</span></button>
              <button className="mode-card" onClick={onRescue}><span className="mode-icon warm">!</span><strong>错卡急救</strong><small>{rescueCount ? `${rescueCount} 张卡片需要巩固` : '暂无待急救卡片'}</small><span>开始训练 →</span></button>
            </div>
          </section>
          <section className="panel">
            <div className="section-heading"><h2>案件掌握</h2><button className="text-button" onClick={() => onCourse(recentCourse)}>查看全部 →</button></div>
            <div className="course-compact-list">
              {content.courses.slice(0, 5).map((course) => <CourseCompact key={course.id} course={course} state={state} onClick={() => onCourse(course)} />)}
            </div>
          </section>
          <section className="panel">
            <div className="section-heading"><div><p className="eyebrow">能力分布</p><h2>五项章节能力</h2></div><span className="soft-badge">按实际评分</span></div>
            <div className="ability-list">{chapterPerformance.map((chapter) => <div key={chapter.id}><div><span>{chapter.title}</span><small>{chapter.attempts ? `${chapter.good} / ${chapter.attempts} 次答对` : '未开始'}</small></div><div className="progress-track"><span style={{ width: `${chapter.percent}%` }} /></div></div>)}</div>
            <p className="recent-session">{recentSession ? `最近学习：${modeLabels[recentSession.mode]} · ${recentSession.attemptIds.length} 次评分 · 当前 ${rescueCount} 张错卡` : '完成首轮学习后，这里会显示最近 session 与错卡变化。'}</p>
          </section>
        </div>
        <aside className="dashboard-side-column">
          <section className="panel readiness-card">
            <p className="eyebrow">面试准备度</p>
            <div className="readiness-ring"><span>{readiness.label}</span></div>
            <h3>{readiness.status === 'unassessed' ? '从第一张卡开始' : readiness.label}</h3>
            <p>{readiness.disclaimer}</p>
          </section>
          <section className="panel tip-card"><span>小提示</span><h3>完整说出，才算真的会。</h3><p>3 秒内能完整说出，才按「会」。模糊并不可耻，它是下一步的路标。</p></section>
        </aside>
      </div>
    </>
  )
}

function Metric({ label, value, suffix, accent = false }: { label: string; value: number; suffix: string; accent?: boolean }) {
  return <div className={`metric-card${accent ? ' accent' : ''}`}><span>{label}</span><div><strong>{value}</strong><small>{suffix}</small></div></div>
}

function CourseCompact({ course, state, onClick }: { course: Course; state: LearningState; onClick: () => void }) {
  const core = course.cards.filter((card) => card.level === 'core')
  const learned = core.filter((card) => state.progress[card.id]).length
  return <button className="course-compact" onClick={onClick}><span className="course-monogram">{course.title.slice(0, 1)}</span><span><strong>{course.title}</strong><small>{learned ? `已学习 ${learned} 张核心卡` : '尚未开始'}</small></span><span>→</span></button>
}

function CourseLibrary({ content, state, onCourse }: { content: CourseContent; state: LearningState; onCourse: (course: Course) => void }) {
  return <><header className="page-header"><div><p className="eyebrow">十个案件 · 五项能力</p><h1>案件课程</h1><p>从事实到表达，建立完整的案件地图。</p></div></header><div className="course-grid">{content.courses.map((course, index) => {
    const core = course.cards.filter((card) => card.level === 'core')
    const learned = core.filter((card) => state.progress[card.id]).length
    return <button className="course-card" key={course.id} onClick={() => onCourse(course)}><div className="course-card-top"><span>{String(index + 1).padStart(2, '0')}</span><span className="soft-badge">5 个章节</span></div><h2>{course.title}</h2><p>{course.description}</p><div className="progress-track"><span style={{ width: `${core.length ? learned / core.length * 100 : 0}%` }} /></div><small>{learned} / {core.length} 核心卡已学习</small></button>
  })}</div></>
}

function CourseDetail({ course, state, chapterId, onChapter, onBack, onStart }: { course: Course; state: LearningState; chapterId: string; onChapter: (id: string) => void; onBack: () => void; onStart: (set: CardSet, chapterId?: string) => void }) {
  const chapter = course.chapters.find((item) => item.id === chapterId) ?? course.chapters[0]
  const chapterCards = course.cards.filter((card) => card.chapterId === chapter.id)
  const core = chapterCards.filter((card) => card.level === 'core')
  const learned = core.filter((card) => state.progress[card.id]).length
  const hasSummary = course.cards.some((card) => card.kind === 'summary')
  return <>
    <button className="back-button" onClick={onBack}>← 返回案件课程</button>
    <header className="course-hero"><p className="eyebrow">案件课程</p><h1>{course.title}</h1><p>{course.description}</p>{course.riskNote && <p className="risk-note">{course.riskNote}</p>}</header>
    <div className="chapter-tabs" role="tablist" aria-label="课程章节">{course.chapters.map((item, index) => <button role="tab" aria-selected={item.id === chapter.id} className={item.id === chapter.id ? 'active' : ''} key={item.id} onClick={() => onChapter(item.id)}><span>0{index + 1}</span>{item.title}</button>)}</div>
    <section className="panel chapter-panel"><div className="section-heading"><div><p className="eyebrow">当前章节</p><h2>{chapter.title}</h2></div><span className="soft-badge">{learned} / {core.length} 已学习</span></div><p>先完成核心回忆，再用不同题型检查；最后回到完整案件表达。</p><div className="button-row"><button className="primary-button" onClick={() => onStart('core', chapter.id)}>核心学习</button><button className="secondary-button" onClick={() => onStart('assessment', chapter.id)}>章节检查</button><button className="secondary-button" onClick={() => onStart('advanced', chapter.id)}>进阶训练</button></div></section>
    <section className="panel link-panel"><div><p className="eyebrow">整案表达</p><h2>把碎片重新讲成一个案件</h2><p>20 秒结论、90 秒陈述与连续追问，使用核对点人工评价。</p></div><button className="primary-button" disabled={!hasSummary} onClick={() => onStart('link')}>串联表达</button></section>
  </>
}

function StudyView({ state, cards, card, course, revealed, notice, canUndo, elapsed, timerRunning, checkedPoints, onBack, onReveal, onRate, onUndo, onTimer, onResetTimer, onCheck, onRetry }: {
  state: LearningState; cards: Card[]; card?: Card; course?: Course; revealed: boolean; notice: string; canUndo: boolean; elapsed: number; timerRunning: boolean; checkedPoints: number[]
  onBack: () => void; onReveal: () => void; onRate: (rating: Rating, checklistPassed?: boolean) => void; onUndo: () => void; onTimer: () => void; onResetTimer: () => void; onCheck: (index: number) => void; onRetry: () => void
}) {
  const touchStart = useRef<{ clientX: number; clientY: number } | null>(null)
  const touchCurrent = useRef<{ clientX: number; clientY: number } | null>(null)

  function handleTouchEnd(changedTouches: ArrayLike<{ clientX: number; clientY: number }>) {
    const start = touchStart.current
    const touch = changedTouches[0] ?? touchCurrent.current
    touchStart.current = null
    touchCurrent.current = null
    if (!start || !touch || !card) return
    const dx = touch.clientX - start.clientX
    const dy = touch.clientY - start.clientY
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 60) return
    if (Math.abs(dx) > Math.abs(dy)) {
      if (revealed && card.kind !== 'summary') onRate(dx < 0 ? 'again' : 'good')
    } else if (dy > 0) {
      if (!revealed) onReveal()
      else if (card.kind !== 'summary') onRate('fuzzy')
    }
  }

  if (!card || !state.activeRun || state.activeRun.endedAt) {
    const empty = !state.activeRun || state.activeRun.queue.length === 0 && state.sessions.at(-1)?.attemptIds.length === 0
    const sessionId = state.activeRun?.sessionId
    const weakCards = [...new Set(state.attempts.filter((attempt) => attempt.sessionId === sessionId && (attempt.rating !== 'good' || attempt.checklistPassed === false)).map((attempt) => attempt.cardId))]
    return <section className="completion-card"><span className="completion-mark">✓</span><p className="eyebrow">{empty ? '当前没有到期卡片' : '本轮完成'}</p><h1>{empty ? '稍作休息，或选择其他训练' : '认真完成的每一步，都算数'}</h1><p>{empty ? '混合复习只安排到期卡；错卡急救只安排尚未稳定的薄弱卡。' : '学习记录已保存在本机，可返回首页查看进度。'}</p>{weakCards.length > 0 && <div className="weak-card-summary"><strong>需要重点巩固</strong>{weakCards.map((cardId) => <p key={cardId}>{cards.find((item) => item.id === cardId)?.prompt ?? cardId}</p>)}</div>}<div className="button-row centered"><button className="primary-button" onClick={onBack}>返回今日首页</button>{!empty && <button className="secondary-button" onClick={onRetry}>再来一轮</button>}</div></section>
  }
  const chapter = course?.chapters.find((item) => item.id === card.chapterId)
  const checklist = card.checklist ?? []
  const allChecked = checklist.length > 0 && checkedPoints.length === checklist.length
  return <div className={`study-shell${revealed ? ' revealed' : ''}`}>
    <div className="study-topbar"><button className="back-button" onClick={onBack}>← 返回案件地图</button><div><span>{modeLabels[state.activeRun.mode]}</span><button className="text-button" disabled={!canUndo} onClick={onUndo}>撤销评分 ⌘Z</button></div></div>
    <div className="study-context"><span>{course?.title}</span><span>›</span><span>{chapter?.title}</span><span>›</span><span>{kindLabels[card.kind]}</span></div>
    <p className="gesture-hint">手势版 2：左滑不会 · 右滑会 · 下滑模糊</p>
    <article
      className="study-card"
      onTouchStart={(event) => {
        const point = { clientX: event.touches[0].clientX, clientY: event.touches[0].clientY }
        touchStart.current = point
        touchCurrent.current = point
      }}
      onTouchMove={(event) => {
        const point = { clientX: event.touches[0].clientX, clientY: event.touches[0].clientY }
        touchCurrent.current = point
        const start = touchStart.current
        if (start && Math.max(Math.abs(point.clientX - start.clientX), Math.abs(point.clientY - start.clientY)) >= 60) handleTouchEnd([point])
      }}
      onTouchEnd={(event) => handleTouchEnd(event.changedTouches)}
      onTouchCancel={() => handleTouchEnd([])}
    >
      <div className="study-card-meta"><span className={`level-badge ${card.level}`}>{card.level === 'core' ? '核心卡' : card.level === 'advanced' ? '进阶检查' : '串联卡'}</span>{card.redLine && <span className="redline-badge">红线纠错</span>}<span>剩余 {state.activeRun.queue.length} 张</span></div>
      <h1>{card.prompt}</h1>
      {!revealed ? <div className="answer-placeholder"><span>先在心里完整回答</span><button className="reveal-button" aria-label={card.kind === 'summary' ? '显示核对点' : '显示答案'} onClick={onReveal}>{card.kind === 'summary' ? '显示核对点' : '显示答案'}<small>Space / ↓</small></button></div> : <div className="answer-content">
        {card.answer && <><p className="answer-label">参考答案</p><p className="answer-text">{card.answer}</p></>}
        {card.answerPoints && <ul>{card.answerPoints.map((point) => <li key={point}>{point}</li>)}</ul>}
        {card.followUps?.map((followUp) => <div className="follow-up" key={followUp.prompt}><strong>追问：{followUp.prompt}</strong><p>{followUp.answer}</p></div>)}
        {card.kind === 'summary' && <div className="checklist"><p className="answer-label">口头陈述核对点</p>{checklist.map((point, index) => <label key={point} className={checkedPoints.includes(index) ? 'checked' : ''}><input type="checkbox" checked={checkedPoints.includes(index)} onChange={() => onCheck(index)} />{point}</label>)}</div>}
        <details className="source-details"><summary>查看材料溯源</summary>{card.sourceRefs.map((source) => <p key={`${source.path}${source.locator}`}>{source.label} · {source.path}{source.locator ? ` · ${source.locator}` : ''}</p>)}</details>
      </div>}
    </article>
    {card.kind === 'summary' && <section className="timer-panel"><div><span>目标 {card.estimatedSeconds} 秒</span><strong>{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</strong></div><div className="button-row"><button className="secondary-button" onClick={onTimer}>{timerRunning ? '暂停计时' : '开始计时'}</button><button className="text-button" onClick={onResetTimer}>重置计时</button></div></section>}
    {card.kind === 'summary' ? <div className={`rating-area${revealed ? '' : ' pending'}`}><p>{revealed ? '逐项核对，不用短答案匹配代替口头表达。' : '先显示核对点，再完成人工评价。'}</p><div className="rating-grid summary-ratings"><button className="rating-again" disabled={!revealed} onClick={() => onRate('again', false)}>未通过，稍后重现</button><button className="rating-good" disabled={!revealed || !allChecked} onClick={() => onRate('good', true)}>核对通过并完成</button></div></div> : <div className={`rating-area${revealed ? '' : ' pending'}`}><p>{revealed ? '3 秒内能完整说出，才按「会」。' : '先显示答案；评分按钮目前不可用。'}</p><div className="rating-grid"><button aria-label="不会" disabled={!revealed} className="rating-again" onClick={() => onRate('again')}><strong>不会</strong><small>← 约 3 张后重现</small></button><button aria-label="模糊" disabled={!revealed} className="rating-fuzzy" onClick={() => onRate('fuzzy')}><strong>模糊</strong><small>↓ 约 10 张后重现</small></button><button aria-label="会" disabled={!revealed} className="rating-good" onClick={() => onRate('good')}><strong>会</strong><small>→ 进入间隔复习</small></button></div></div>}
    {notice && <p className="study-notice" role="status">{notice}</p>}
  </div>
}

function GrowthView({ content, state }: { content: CourseContent; state: LearningState }) {
  const cards = content.courses.flatMap((course) => course.cards)
  const readiness = getReadiness(cards, state)
  const recent = [...state.attempts].reverse().slice(0, 12)
  return <><header className="page-header"><div><p className="eyebrow">真实记录 · 可解释反馈</p><h1>成长记录</h1><p>关注从模糊到稳定的变化，而不是刷卡数量。</p></div></header><div className="growth-grid"><section className="panel"><div className="section-heading"><h2>准备度核对</h2><span className="soft-badge">{readiness.label}</span></div>{readiness.checks.map((check) => <div className="readiness-check" key={check.id}><span className={check.passed ? 'check-pass' : 'check-pending'}>{check.passed ? '✓' : '○'}</span>{check.label}</div>)}<p className="disclaimer">{readiness.disclaimer}</p></section><section className="panel"><h2>最近学习</h2>{recent.length === 0 ? <p className="empty-copy">完成第一次评分后，这里会留下可回查的学习轨迹。</p> : <div className="attempt-list">{recent.map((attempt) => <div key={attempt.attemptId}><span className={`attempt-rating ${attempt.rating}`}>{attempt.rating === 'good' ? '会' : attempt.rating === 'fuzzy' ? '模糊' : '不会'}</span><span><strong>{cards.find((card) => card.id === attempt.cardId)?.prompt ?? attempt.cardId}</strong><small>{new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(attempt.ratedAt))} · {Math.round(attempt.responseMs / 1000)} 秒</small></span></div>)}</div>}</section></div></>
}

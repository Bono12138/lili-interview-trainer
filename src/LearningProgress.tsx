import type { PracticeSummary } from './domain/motivation'
import type { ReadinessAction, ReadinessResult } from './domain/progress'

export function ProgressTrack({ label, value, max }: { label: string; value: number; max: number }) {
  return <div className="progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={Math.max(1, max)} aria-valuenow={Math.min(value, Math.max(1, max))}><span style={{ width: `${max ? Math.min(100, value / max * 100) : 0}%` }} /></div>
}

export function DailyPractice({ practice, onStart }: { practice: PracticeSummary; onStart?: () => void }) {
  return <section className={`daily-practice${practice.goalReached ? ' goal-reached' : ''}`} aria-label="今日练习">
    <div className="daily-heading"><div><p>今日小目标</p><h2>{practice.goalReached ? '今天的目标，完成了。' : '每天十张，越讲越清楚。'}</h2></div><span className="practice-level">Lv.{practice.level}</span></div>
    <div className="daily-count"><strong>{practice.todayCards}<span> / {practice.dailyGoal} 张</span></strong><span>{practice.goalReached ? '✓ 目标达成' : `再练 ${Math.max(0, practice.dailyGoal - practice.todayCards)} 张不同卡`}</span></div>
    <ProgressTrack label="今日练习目标" value={practice.todayCards} max={practice.dailyGoal} />
    <div className="practice-facts"><span>连续学习 <strong>{practice.streak}</strong> 天</span><span><strong>{practice.totalXP}</strong> 练习值</span><span>距下一级 <strong>{practice.nextLevelXP}</strong></span></div>
    {onStart && <button className="primary-button daily-cta" onClick={onStart}>{practice.goalReached ? '按自己的节奏再练一轮' : practice.todayCards ? '继续今天的目标' : '开始今天的第一张'}<span>→</span></button>}
    <div className="practice-week" aria-label="近七天练习">{practice.week.map((day) => <div key={day.key} className={`${day.count ? 'practiced' : ''}${day.today ? ' today' : ''}`} title={`${day.key}：${day.count} 张`}><span>{day.label}</span><strong aria-label={`${day.key}练习${day.count}张`}>{day.count ? '✓' : '·'}</strong></div>)}</div>
  </section>
}

export function ReadinessPanel({ readiness, onPractice }: { readiness: ReadinessResult; onPractice: (action: ReadinessAction) => void }) {
  return <section className="panel readiness-progress" aria-label="面试准备度">
    <div className="section-heading"><div><h2>面试准备度</h2><p>自设训练项目完成进度</p></div><strong className="readiness-percent">{readiness.percent}<small>%</small></strong></div>
    <ProgressTrack label="训练准备进度" value={readiness.percent} max={100} />
    <div className="readiness-parts">{readiness.checks.map((check) => <div key={check.id} className={check.passed ? 'part-complete' : ''}><div><span>{check.passed ? '✓ ' : ''}{check.label}</span><strong>{check.total ? `${check.completed} / ${check.total}` : '暂无待练'}</strong></div><ProgressTrack label={check.label} value={check.completed} max={check.total} /></div>)}</div>
    {readiness.next ? <button aria-label={readiness.next.label} className="secondary-button readiness-next" onClick={() => onPractice(readiness.next!)}>{readiness.next.label}<span>→</span></button> : <p className="readiness-finished">✓ {readiness.label}，可以按需复习。</p>}
    <details className="readiness-method"><summary>准备度怎么算？</summary><p>核心覆盖占 30%，章节检查 25%，整案陈述 25%，红线纠正与风险巩固各 10%。章节数只统计有检查卡的章节；没有适用卡片的项目不计入权重。检查与陈述取最近一次结果；风险卡需连续两次评为会。</p></details><p className="disclaimer">{readiness.disclaimer}</p>
  </section>
}

export function Achievements({ practice }: { practice: PracticeSummary }) {
  const unlocked = practice.achievements.filter((badge) => badge.earned).length
  return <section className="panel achievement-panel"><div className="section-heading"><h2>练习成就</h2><span>{unlocked} / {practice.achievements.length} 成就</span></div><div className="achievement-list">{practice.achievements.map((badge, i) => <div key={badge.id} className={badge.earned ? 'achievement earned' : 'achievement'}><span className="achievement-mark" aria-hidden="true">{badge.earned ? '✓' : String(i + 1).padStart(2, '0')}</span><div><strong>{badge.title}</strong><p>{badge.detail}</p></div><small>{badge.earned ? '已解锁' : '待解锁'}</small></div>)}</div><p className="reward-explanation">同卡每天首次练习 +5；薄弱卡首次连续两次评为会 +10；每案首次通过陈述核对 +20。练习值记录投入，准备度记录训练完成情况。</p></section>
}

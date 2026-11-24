import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AnswerLog, Problem } from './types'
import { DRILLS, PROBLEMS } from './data/drills'
import { useLocalStorage } from './hooks/useLocalStorage'
import { shuffle } from './lib/problem'
import { correctFeedback, daily, goalFeedback, wrongFeedback } from './lib/habit'
import { DailyBar } from './components/DailyBar'
import { Confetti } from './components/Confetti'
import { Practice } from './components/Practice'
import { Stats } from './components/Stats'

type Tab = 'practice' | 'stats'

const ALL = 'すべて'
const REVIEW = '間違えた問題'
/** 最初は一番新しいドリルを出す */
const NEWEST = DRILLS[0]?.label ?? ALL
const BY_ID = new Map(PROBLEMS.map((p) => [p.id, p]))

/** 出題の進み具合。ブラウザに保存し、タブを切り替えたり開き直したりしても続きから出す */
interface Session {
  filter: string
  /** 出題順の問題 ID */
  ids: string[]
  /** 次に出す問題の位置（答え合わせした時点で進める） */
  index: number
  /** このセッションを始めたときの一番新しいドリル。新しいドリルが届いたらそちらに切り替える */
  newest: string
  /** 選んだ範囲を解き終えて「おすすめ」を足し始めた位置 */
  endlessFrom?: number
}

/** 足す問題の数 */
const BATCH = 10

/**
 * 選んだ範囲を解き終えたら、終わりにせずに足していく問題。
 * 間違えた問題 → まだ解いていない問題 → 前に解いてから時間がたった問題 の順に選ぶ（直前に出した問題は除く）
 */
function nextBatch(session: Session, logs: AnswerLog[], wrongIds: Set<string>): string[] {
  const lastSeen = new Map<string, number>()
  for (const l of logs) lastSeen.set(l.problemId, Date.parse(l.at))
  const recent = new Set(session.ids.slice(-BATCH))
  const pool = PROBLEMS.filter((p) => !recent.has(p.id))
  if (pool.length === 0) return shuffle(PROBLEMS).map((p) => p.id)
  const rank = (p: Problem) => (wrongIds.has(p.id) ? 0 : lastSeen.has(p.id) ? 2 : 1)
  const ordered = shuffle(pool).sort(
    (a, b) => rank(a) - rank(b) || (rank(a) === 2 ? lastSeen.get(a.id)! - lastSeen.get(b.id)! : 0),
  )
  return shuffle(ordered.slice(0, BATCH)).map((p) => p.id)
}

const problemsFor = (f: string, wrongIds: Set<string>) =>
  f === ALL ? PROBLEMS : f === REVIEW ? PROBLEMS.filter((p) => wrongIds.has(p.id)) : PROBLEMS.filter((p) => p.tag === f)

const newSession = (f: string, wrongIds: Set<string>): Session => ({
  filter: f,
  ids: shuffle(problemsFor(f, wrongIds)).map((p) => p.id),
  index: 0,
  newest: NEWEST,
})

/** 保存しておいたセッションを今の問題に合わせる（新しいドリルが届いていたら、そのドリルから始める） */
function restore(saved: Session | null): Session {
  if (!saved || saved.newest !== NEWEST) return newSession(NEWEST, new Set())
  if (saved.ids.every((id) => BY_ID.has(id))) return saved
  // 消えた問題（MD が消えた・書き換わった）は飛ばす
  const done = saved.ids.slice(0, saved.index).filter((id) => BY_ID.has(id)).length
  const ids = saved.ids.filter((id) => BY_ID.has(id))
  return { ...saved, ids, index: done }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('practice')
  const [logs, setLogs] = useLocalStorage<AnswerLog[]>('sakubun.drill.logs', [])
  const [savedSession, setSession] = useLocalStorage<Session | null>('sakubun.drill.session', null)
  const session = useMemo(() => restore(savedSession), [savedSession])
  // 初めて開いたときや新しいドリルが届いたときに作ったセッションを保存する
  useEffect(() => {
    if (session !== savedSession) setSession(session)
  }, [session, savedSession, setSession])
  // 答え合わせ後、「次へ」を押すまで結果を見せておく問題
  const [reviewing, setReviewing] = useState<{
    problem: Problem
    position: string
    combo: number
    newBest: boolean
  } | null>(null)
  const [goal, setGoal] = useLocalStorage('sakubun.goal', 10)
  const [sound, setSound] = useLocalStorage('sakubun.sound', true)
  const [bestCombo, setBestCombo] = useLocalStorage('sakubun.bestCombo', 0)
  const [combo, setCombo] = useState(0)
  const [celebrate, setCelebrate] = useState(false)
  const celebrateTimer = useRef<number>(undefined)
  // 同じ問題が続けて出たときも Practice を作り直すための番号
  const [round, setRound] = useState(0)

  const latest = new Map<string, boolean>()
  for (const l of logs) latest.set(l.problemId, l.correct)
  const wrongIds = new Set([...latest].filter(([id, ok]) => !ok && BY_ID.has(id)).map(([id]) => id))

  const start = (f: string) => {
    setSession(newSession(f, wrongIds))
    setReviewing(null)
    setRound((r) => r + 1)
  }

  const queue = session.ids.map((id) => BY_ID.get(id)!)
  const current = queue[session.index]
  const endless = session.endlessFrom !== undefined && session.index >= session.endlessFrom
  const position = endless
    ? `おすすめ ${session.index - session.endlessFrom! + 1}問目`
    : `${session.index + 1} / ${session.endlessFrom ?? queue.length}`
  const shown = reviewing ?? (current && { problem: current, position, combo: 0, newBest: false })

  // 選んだ範囲を解き終えたら、おすすめの問題を足して続ける
  useEffect(() => {
    if (!current && !reviewing && PROBLEMS.length > 0) {
      setSession({
        ...session,
        ids: [...session.ids, ...nextBatch(session, logs, wrongIds)],
        endlessFrom: session.endlessFrom ?? session.ids.length,
      })
    }
  })

  const today = daily(logs, goal)

  const next = useCallback(() => {
    setReviewing(null)
    setRound((r) => r + 1)
  }, [])

  const answered = (problem: Problem, position: string, correct: boolean) => {
    setLogs((prev) => [...prev, { problemId: problem.id, correct, at: new Date().toISOString() }])
    const nextCombo = correct ? combo + 1 : 0
    const newBest = nextCombo > bestCombo && nextCombo >= 3
    setCombo(nextCombo)
    if (newBest) setBestCombo(nextCombo)
    if (correct) correctFeedback(nextCombo, sound)
    else wrongFeedback(sound)
    // 今日の目標をちょうど達成したら花火
    if (today.today + 1 === goal) {
      setTimeout(() => goalFeedback(sound), 350)
      setCelebrate(true)
      window.clearTimeout(celebrateTimer.current)
      celebrateTimer.current = window.setTimeout(() => setCelebrate(false), 3500)
    }
    // 答え合わせした時点で解いたことにする（結果は「次へ」を押すまで表示したまま）
    setReviewing({ problem, position, combo: nextCombo, newBest })
    setSession({ ...session, index: session.index + 1 })
  }

  const switchTab = (t: Tab) => {
    if (t !== 'practice') setReviewing(null)
    setTab(t)
  }

  return (
    <div className="app">
      <header className="header">
        <h1>
          英作文<span>ドリル</span>
        </h1>
        <DailyBar daily={today} sound={sound} onToggleSound={() => setSound(!sound)} />
      </header>
      {celebrate && <Confetti streak={today.streak} />}
      <nav className="tabs">
        <button className={tab === 'practice' ? 'active' : ''} onClick={() => switchTab('practice')}>
          練習
        </button>
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => switchTab('stats')}>
          記録
        </button>
      </nav>

      {tab === 'stats' ? (
        <Stats problems={PROBLEMS} logs={logs} onReset={() => setLogs([])} goal={goal} onGoalChange={setGoal} bestCombo={bestCombo} />
      ) : (
        <>
          <div className="filter">
            <select value={session.filter} onChange={(e) => start(e.target.value)} aria-label="出題範囲">
              {DRILLS.map((d) => (
                <option key={d.name} value={d.label}>
                  {d.label}（{d.problems.length}）
                </option>
              ))}
              <option value={ALL}>すべてのドリル（{PROBLEMS.length}）</option>
              <option value={REVIEW} disabled={wrongIds.size === 0 && session.filter !== REVIEW}>
                {REVIEW}（{wrongIds.size}）
              </option>
            </select>
            {endless ? (
              <p className="muted small review-note">選んだ問題はひと通り解きました。ここからは、間違えた問題やしばらく解いていない問題が続きます。</p>
            ) : session.filter === REVIEW ? (
              <p className="muted small review-note">間違えた問題の復習中。正解するとその問題は復習リストから外れます。</p>
            ) : (
              wrongIds.size > 0 && (
                <button className="review-btn" onClick={() => start(REVIEW)}>
                  間違えた問題だけ復習する（{wrongIds.size}問）
                </button>
              )
            )}
          </div>

          {shown ? (
            <Practice
              key={`${round}-${shown.problem.id}`}
              problem={shown.problem}
              position={shown.position}
              onAnswered={(correct) => answered(shown.problem, shown.position, correct)}
              onNext={next}
              combo={reviewing ? shown.combo : 0}
              newBest={reviewing ? shown.newBest : false}
            />
          ) : (
            <div className="done">
              <p>
                {PROBLEMS.length === 0
                  ? 'まだドリルがありません。content/drills/ に MD ファイルが入ると、ここに問題が出ます。'
                  : '読み込み中…'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

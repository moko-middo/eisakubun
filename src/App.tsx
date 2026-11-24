import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AnswerLog, Problem } from './types'
import { DRILLS, PROBLEMS } from './data/drills'
import { useLocalStorage } from './hooks/useLocalStorage'
import { shuffle } from './lib/problem'
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
  const [reviewing, setReviewing] = useState<{ problem: Problem; position: string } | null>(null)
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
  const shown = reviewing ?? (current && { problem: current, position: `${session.index + 1} / ${queue.length}` })

  const next = useCallback(() => {
    setReviewing(null)
    setRound((r) => r + 1)
  }, [])

  const answered = (problem: Problem, position: string, correct: boolean) => {
    setLogs((prev) => [...prev, { problemId: problem.id, correct, at: new Date().toISOString() }])
    // 答え合わせした時点で解いたことにする（結果は「次へ」を押すまで表示したまま）
    setReviewing({ problem, position })
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
        <p className="muted small">センテンスリピートドリルの英文を、並べ替えと入力で組み立てる</p>
      </header>
      <nav className="tabs">
        <button className={tab === 'practice' ? 'active' : ''} onClick={() => switchTab('practice')}>
          練習
        </button>
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => switchTab('stats')}>
          記録
        </button>
      </nav>

      {tab === 'stats' ? (
        <Stats problems={PROBLEMS} logs={logs} onReset={() => setLogs([])} />
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
            {session.filter === REVIEW ? (
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
            />
          ) : (
            <div className="done">
              <p>
                {PROBLEMS.length === 0
                  ? 'まだドリルがありません。content/drills/ に MD ファイルが入ると、ここに問題が出ます。'
                  : queue.length === 0
                    ? '出題できる問題がありません。'
                    : `${queue.length} 問おわりました。`}
              </p>
              <div className="actions">
                {wrongIds.size > 0 && (
                  <button className="sub-btn" onClick={() => start(REVIEW)}>
                    間違えた問題（{wrongIds.size}）
                  </button>
                )}
                <button className="primary-btn" onClick={() => start(session.filter === REVIEW ? NEWEST : session.filter)}>
                  もう一度
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

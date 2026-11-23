import { useCallback, useState } from 'react'
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
const DEFAULT = DRILLS[0]?.label ?? ALL

const problemsFor = (f: string, wrongIds: Set<string>) =>
  f === ALL ? PROBLEMS : f === REVIEW ? PROBLEMS.filter((p) => wrongIds.has(p.id)) : PROBLEMS.filter((p) => p.tag === f)

export default function App() {
  const [tab, setTab] = useState<Tab>('practice')
  const [logs, setLogs] = useLocalStorage<AnswerLog[]>('sakubun.drill.logs', [])
  const [filter, setFilter] = useState(DEFAULT)
  const [queue, setQueue] = useState<Problem[]>(() => shuffle(problemsFor(DEFAULT, new Set())))
  const [index, setIndex] = useState(0)
  // 同じ問題が続けて出たときも Practice を作り直すための番号
  const [round, setRound] = useState(0)

  const latest = new Map<string, boolean>()
  for (const l of logs) latest.set(l.problemId, l.correct)
  const wrongIds = new Set([...latest].filter(([, ok]) => !ok).map(([id]) => id))

  const start = (f: string) => {
    const list = problemsFor(f, wrongIds)
    setFilter(f)
    setQueue(shuffle(list))
    setIndex(0)
    setRound((r) => r + 1)
  }

  const current = queue[index]

  const next = useCallback(() => {
    setIndex((i) => i + 1)
    setRound((r) => r + 1)
  }, [])

  return (
    <div className="app">
      <header className="header">
        <h1>
          英作文<span>ドリル</span>
        </h1>
        <p className="muted small">センテンスリピートドリルの英文を、並べ替えと入力で組み立てる</p>
      </header>
      <nav className="tabs">
        <button className={tab === 'practice' ? 'active' : ''} onClick={() => setTab('practice')}>
          練習
        </button>
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
          記録
        </button>
      </nav>

      {tab === 'stats' ? (
        <Stats problems={PROBLEMS} logs={logs} onReset={() => setLogs([])} />
      ) : (
        <>
          <div className="filter">
            <select value={filter} onChange={(e) => start(e.target.value)} aria-label="出題範囲">
              {DRILLS.map((d) => (
                <option key={d.name} value={d.label}>
                  {d.label}（{d.problems.length}）
                </option>
              ))}
              <option value={ALL}>すべてのドリル（{PROBLEMS.length}）</option>
              <option value={REVIEW} disabled={wrongIds.size === 0 && filter !== REVIEW}>
                {REVIEW}（{wrongIds.size}）
              </option>
            </select>
          </div>

          {current ? (
            <Practice
              key={`${round}-${current.id}`}
              problem={current}
              position={`${index + 1} / ${queue.length}`}
              onAnswered={(correct) =>
                setLogs((prev) => [...prev, { problemId: current.id, correct, at: new Date().toISOString() }])
              }
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
                <button className="primary-btn" onClick={() => start(filter === REVIEW ? ALL : filter)}>
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

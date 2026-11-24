import type { AnswerLog, Problem } from '../types'
import { aiPrompt, summarize } from '../lib/analyze'
import { CopyButton } from './CopyButton'

/** 集計に使う、直近の間違いの数 */
const RECENT = 30
/** AI に送る間違いの数 */
const FOR_AI = 10

export function Weakness({ problems, logs }: { problems: Problem[]; logs: AnswerLog[] }) {
  const byId = new Map(problems.map((p) => [p.id, p]))
  const items = logs
    .filter((l) => !l.correct && l.placed && byId.has(l.problemId))
    .slice(-RECENT)
    .map((l) => ({ problem: byId.get(l.problemId)!, placed: l.placed! }))

  if (items.length === 0) {
    return <p className="muted small">間違えた問題があると、ここに間違いの傾向が出ます。</p>
  }

  const s = summarize(items)
  const max = Math.max(...s.byKind.map((k) => k.count))
  return (
    <div className="weakness">
      <p className="muted small">直近 {items.length} 回の間違いから</p>

      <ul className="kind-bars">
        {s.byKind.map((k) => (
          <li key={k.kind}>
            <span className={`kind kind-${k.kind}`}>{k.kind}</span>
            <div className="bar">
              <div className="bar-fill" style={{ width: `${(k.count / max) * 100}%` }} />
            </div>
            <span className="muted small">{k.count}</span>
          </li>
        ))}
      </ul>

      {s.tips.length > 0 && (
        <>
          <h4>気をつけたいポイント</h4>
          <ul className="tips">
            {s.tips.slice(0, 3).map((t) => (
              <li key={t.tip}>
                💡 {t.tip}
                <span className="muted small">（{t.count} 回）</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {s.words.length > 0 && (
        <>
          <h4>よく間違える単語</h4>
          <ul className="word-list">
            {s.words.slice(0, 8).map((w) => (
              <li key={w.word}>
                <strong>{w.word}</strong>
                <span className="muted small">
                  {w.kinds.join('・')} {w.count} 回
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {s.order.length > 0 && (
        <>
          <h4>よく位置を間違える語</h4>
          <ul className="word-list">
            {s.order.slice(0, 8).map((w) => (
              <li key={w.word}>
                <strong>{w.word}</strong>
                <span className="muted small">{w.count} 回</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <CopyButton
        text={aiPrompt(items.slice(-FOR_AI))}
        label={`直近 ${Math.min(FOR_AI, items.length)} 問の間違いを AI に詳しく解説してもらう（コピー）`}
      />
    </div>
  )
}

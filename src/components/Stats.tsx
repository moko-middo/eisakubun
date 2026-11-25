import type { AnswerLog, Problem } from '../types'
import { drillReports, GRADUATE, type DrillMeta, type NoteStatus } from '../lib/notebook'
import { SyncSettings } from './SyncSettings'

interface Props {
  logs: AnswerLog[]
  drillMeta: DrillMeta[]
  status: Map<string, NoteStatus>
  lookup: Map<string, Problem>
  onReset: () => void
  goal: number
  onGoalChange: (goal: number) => void
  bestCombo: number
}

const GOALS = [5, 10, 20, 30]
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)

export function Stats({ logs, drillMeta, status, lookup, onReset, goal, onGoalChange, bestCombo }: Props) {
  const correct = logs.filter((l) => l.correct).length
  const notes = [...status].filter(([id]) => lookup.has(id))
  const active = notes.filter(([, s]) => !s.graduated)
  const graduated = notes
    .filter(([, s]) => s.graduated)
    .sort((a, b) => (b[1].graduatedAt ?? '').localeCompare(a[1].graduatedAt ?? ''))
  const reports = drillReports(drillMeta, logs)

  return (
    <section>
      <div className="stat-grid">
        <div className="stat">
          <span className="stat-label">解いた回数</span>
          <strong>{logs.length}</strong>
        </div>
        <div className="stat">
          <span className="stat-label">正答率</span>
          <strong>{pct(correct, logs.length)}%</strong>
        </div>
        <div className="stat">
          <span className="stat-label">卒業した問題</span>
          <strong>{graduated.length}</strong>
        </div>
      </div>

      <div className="habit-settings">
        <label>
          1日の目標
          <select value={goal} onChange={(e) => onGoalChange(Number(e.target.value))}>
            {GOALS.map((g) => (
              <option key={g} value={g}>
                {g}問
              </option>
            ))}
          </select>
        </label>
        <span className="muted small">連続正解の自己ベスト: 🔥 {bestCombo}</span>
      </div>

      <h3 className="section-title">成績表</h3>
      {reports.length === 0 ? (
        <p className="muted small">ドリルを解くと、ドリルごとの成績がここに残ります。</p>
      ) : (
        <div className="report-wrap">
          <table className="report">
            <thead>
              <tr>
                <th>ドリル</th>
                <th>1回目の正答率</th>
                <th>最終正解</th>
                <th>伸び</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const first = pct(r.firstCorrect, r.tried)
                const final = pct(r.finalCorrect, r.tried)
                return (
                  <tr key={r.name}>
                    <td>
                      {r.label.replace(' のドリル', '')}
                      <span className="sub">
                        全{r.total}問{r.tried < r.total && `・${r.tried}問解いた`}
                      </span>
                    </td>
                    <td>
                      {first}%<span className="sub">{r.firstCorrect}問</span>
                    </td>
                    <td>
                      {r.finalCorrect}問<span className="sub">{final}%</span>
                    </td>
                    <td className={final > first ? 'plus' : ''}>{final > first ? `+${final - first}%` : '±0'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">ドリルが一覧から消えても、成績はここに残ります。「最終正解」は何回目かで正解できた問題、「伸び」は1回目からどれだけ上がったか（割合は解いた問題に対して）。</p>

      <h3 className="section-title">
        📒 苦手ノート（{active.length}問）
      </h3>
      {active.length === 0 ? (
        <p className="muted small">間違えた問題はここに入り、{GRADUATE}回続けて正解すると卒業します。</p>
      ) : (
        <ul className="note-list">
          {active.map(([id, s]) => (
            <li key={id}>
              <span className="note-ja">{lookup.get(id)!.ja}</span>
              <span className="note-progress" aria-label={`あと${GRADUATE - s.streak}回で卒業`}>
                {Array.from({ length: GRADUATE }, (_, i) => (i < s.streak ? '●' : '○')).join('')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {graduated.length > 0 && (
        <details className="graduated">
          <summary className="small">🎓 卒業した問題（{graduated.length}問）</summary>
          <ul className="note-list">
            {graduated.map(([id, s]) => (
              <li key={id}>
                <span className="note-ja">{lookup.get(id)!.ja}</span>
                <span className="muted small">{s.graduatedAt && new Date(s.graduatedAt).toLocaleDateString('ja-JP')}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <SyncSettings />

      {logs.length > 0 && (
        <button className="sub-btn reset" onClick={() => confirm('記録をすべて消しますか？') && onReset()}>
          記録をリセット
        </button>
      )}
    </section>
  )
}

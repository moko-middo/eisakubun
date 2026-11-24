import { useState } from 'react'
import type { AnswerLog } from '../types'
import { blockFor, calendarWeeks, history, localDate, type Block } from '../lib/habit'
import { BLOCK_IMAGE, BLOCK_NAME } from '../lib/blocks'

interface Props {
  logs: AnswerLog[]
  goal: number
}

/** カレンダーに出す週の数 */
const WEEKS = 16
const WEEKDAYS = '日月火水木金土'
const LEGEND: Block[] = ['air', 'dirt', 'grass', 'gold', 'diamond']

const md = (date: string) => {
  const [, m, d] = date.split('-').map(Number)
  return `${m}/${d}`
}
const weekday = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00`).getDay()]

export function Journey({ logs, goal }: Props) {
  const h = history(logs, goal)
  const weeks = calendarWeeks(WEEKS)
  const today = localDate(new Date())
  const [selected, setSelected] = useState(today)

  // これまでに集めたブロック
  const collected = new Map<Block, number>()
  for (const count of h.counts.values()) {
    const b = blockFor(count, goal)
    collected.set(b, (collected.get(b) ?? 0) + 1)
  }
  const selectedCount = h.counts.get(selected) ?? 0
  const selectedBlock = blockFor(selectedCount, goal)

  return (
    <section className="journey">
      <div className="record-grid">
        <div className="record">
          <span className="record-label">🔥 今の連続</span>
          <strong>
            {h.streak}
            <small>日</small>
          </strong>
        </div>
        <div className="record">
          <span className="record-label">🏆 最長連続</span>
          <strong>
            {h.longest}
            <small>日</small>
          </strong>
        </div>
        <div className="record">
          <span className="record-label">⭐ 1日の最高記録</span>
          <strong>
            {h.bestDay?.count ?? 0}
            <small>問</small>
          </strong>
          {h.bestDay && <span className="muted small">{md(h.bestDay.date)}</span>}
        </div>
        <div className="record">
          <span className="record-label">📅 やった日</span>
          <strong>
            {h.activeDays}
            <small>日</small>
          </strong>
          <span className="muted small">合計 {h.total} 問</span>
        </div>
      </div>

      <h3 className="section-title">ブロックの記録</h3>
      <div className="calendar">
        <div className="weekday-labels">
          {[...WEEKDAYS].map((w, i) => (
            <span key={w}>{i % 2 === 1 ? w : ''}</span>
          ))}
        </div>
        <div className="weeks" style={{ gridTemplateColumns: `repeat(${WEEKS}, 1fr)` }}>
          {weeks.map((week, wi) => {
            const first = week.find((d) => d)
            const prev = wi > 0 ? weeks[wi - 1].find((d) => d) : null
            const monthLabel = first && (!prev || first.slice(5, 7) !== prev.slice(5, 7)) ? `${Number(first.slice(5, 7))}月` : ''
            return (
              <div key={wi} className="week">
                <span className="month">{monthLabel}</span>
                {week.map((date, di) =>
                  date ? (
                    <button
                      key={di}
                      className={`block ${blockFor(h.counts.get(date) ?? 0, goal)}${date === today ? ' today' : ''}${
                        date === selected ? ' selected' : ''
                      }`}
                      style={{ backgroundImage: BLOCK_IMAGE[blockFor(h.counts.get(date) ?? 0, goal)] }}
                      onClick={() => setSelected(date)}
                      aria-label={`${md(date)} ${h.counts.get(date) ?? 0}問`}
                    />
                  ) : (
                    <span key={di} className="block future" />
                  ),
                )}
              </div>
            )
          })}
        </div>
      </div>

      <p className="selected-day">
        <span className={`block small-block ${selectedBlock}`} style={{ backgroundImage: BLOCK_IMAGE[selectedBlock] }} />
        {md(selected)}（{weekday(selected)}）{selected === today && '今日'}　
        <strong>{selectedCount} 問</strong>
        <span className="muted small">　{BLOCK_NAME[selectedBlock]}ブロック</span>
      </p>

      <ul className="legend">
        {LEGEND.map((b) => (
          <li key={b}>
            <span className={`block small-block ${b}`} style={{ backgroundImage: BLOCK_IMAGE[b] }} />
            <span>
              {BLOCK_NAME[b]}
              <span className="muted small">
                {b === 'air'
                  ? ' 0問'
                  : b === 'dirt'
                    ? ` 1〜${goal - 1}問`
                    : b === 'grass'
                      ? ` ${goal}問〜（目標達成）`
                      : b === 'gold'
                        ? ` ${goal * 2}問〜`
                        : ` ${goal * 3}問〜`}
              </span>
            </span>
            {b !== 'air' && <strong className="have">×{collected.get(b) ?? 0}</strong>}
          </li>
        ))}
      </ul>
      <p className="muted small">ブロックの種類は、記録タブの「1日の目標」をもとに決まります。</p>
    </section>
  )
}

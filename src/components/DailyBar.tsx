import type { Daily } from '../lib/habit'

interface Props {
  daily: Daily
  sound: boolean
  onToggleSound: () => void
}

/** 連続日数と今日の進み具合 */
export function DailyBar({ daily, sound, onToggleSound }: Props) {
  const { today, goal, streak, doneToday } = daily
  const progress = Math.min(1, today / goal)
  const r = 15
  const c = 2 * Math.PI * r
  const left = goal - today

  return (
    <div className="daily">
      <div className={`streak${doneToday ? ' lit' : ''}`}>
        <span className="flame">🔥</span>
        <strong>{streak}</strong>
        <span className="small">日連続</span>
      </div>
      <div className="today">
        <svg viewBox="0 0 36 36" className="ring" aria-hidden="true">
          <circle cx="18" cy="18" r={r} className="ring-bg" />
          <circle
            cx="18"
            cy="18"
            r={r}
            className={`ring-fg${doneToday ? ' done' : ''}`}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - progress)}
          />
        </svg>
        <div>
          <strong>
            {today}
            <span className="small muted">/{goal}問</span>
          </strong>
          <p className="small muted">
            {doneToday ? '今日の目標達成！' : streak > 0 ? `あと${left}問で${streak + 1}日連続` : `あと${left}問で連続記録スタート`}
          </p>
        </div>
      </div>
      <button className="sound-btn" onClick={onToggleSound} aria-label={sound ? '効果音を消す' : '効果音を鳴らす'}>
        {sound ? '🔊' : '🔇'}
      </button>
    </div>
  )
}

import { useState } from 'react'
import { LEVELS, PROGOS_PRICE, progosBonus, yen, type DayEarning, type Entry, type Level, type Reward } from '../lib/wallet'

export interface Progos {
  /** 前回の結果 */
  last: Level
  /** これまでで一番よかった結果 */
  best: Level
  /** 受けたが、まだ結果を入れていない */
  pending: boolean
}

interface Props {
  balance: number
  days: DayEarning[]
  entries: Entry[]
  rewards: Reward[]
  progos: Progos
  onTakeProgos: () => void
  onProgosResult: (level: Level) => void
  onBuy: (r: Reward) => void
  onAddReward: (name: string, price: number) => void
  onDeleteReward: (id: string) => void
}

const md = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** 履歴に最初に出す件数（「もっと見る」で全部） */
const HISTORY = 10

export function Rewards(props: Props) {
  const { balance, days, entries, rewards, progos } = props
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [result, setResult] = useState<Level>(progos.last)
  const [showAll, setShowAll] = useState(false)
  const earned = days.reduce((s, d) => s + d.total, 0)
  const spent = entries.filter((e) => e.amount < 0).reduce((s, e) => s - e.amount, 0)

  const history = [
    ...days
      .filter((d) => d.total > 0)
      .map((d) => ({ key: `d${d.date}`, at: `${d.date}T23:59:59`, label: 'かせいだ', detail: d.lines, amount: d.total })),
    ...entries.map((e) => ({ key: e.id, at: e.at, label: e.label, detail: [], amount: e.amount })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))

  const left = PROGOS_PRICE - balance
  const addReward = (e: React.FormEvent) => {
    e.preventDefault()
    const p = Number(price.replace(/[^\d]/g, ''))
    if (!name.trim() || !p) return
    props.onAddReward(name.trim(), p)
    setName('')
    setPrice('')
  }

  return (
    <section className="rewards">
      <div className="balance-card">
        <span className="muted small">いまの残高</span>
        <strong>💰 {yen(balance)}</strong>
        <span className="muted small">
          これまでにかせいだ {yen(earned + entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0))}・使った {yen(spent)}
        </span>
      </div>

      <div className="progos-card">
        <div className="progos-head">
          <strong>🎯 PROGOS を受ける</strong>
          <span>{yen(PROGOS_PRICE)}</span>
        </div>
        {progos.pending ? (
          <div className="progos-result">
            <p>結果のレベルを入れて、ボーナスをもらいましょう（前回 {progos.last}）</p>
            <div className="row">
              <select value={result} onChange={(e) => setResult(e.target.value as Level)} aria-label="PROGOS の結果">
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <button className="primary-btn" onClick={() => props.onProgosResult(result)}>
                ボーナスをもらう（+{yen(progosBonus(result, progos.last, progos.best).amount)}）
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="bar">
              <div className="bar-fill" style={{ width: `${Math.min(100, (balance / PROGOS_PRICE) * 100)}%` }} />
            </div>
            <p className="small">
              {left > 0 ? `あと ${yen(left)}（毎日の目標を続けると、1か月ほどで貯まります）` : '受けられます！'}
            </p>
            <button
              className="primary-btn"
              disabled={left > 0}
              onClick={() => confirm(`PROGOS を受けたことにして ${yen(PROGOS_PRICE)} 使いますか？`) && props.onTakeProgos()}
            >
              PROGOS を受けた（−{yen(PROGOS_PRICE)}）
            </button>
          </>
        )}
        <details className="progos-rules">
          <summary className="small">結果によるボーナス（前回 {progos.last}）</summary>
          <ul className="small">
            <li>初めて B2 以上：+20,000円</li>
            <li>前回よりレベルアップ：+15,000円</li>
            <li>前回と同じレベル：+12,000円</li>
            <li>それ以外（受けただけで）：+11,000円</li>
          </ul>
        </details>
      </div>

      <h3 className="section-title">自分へのごほうび</h3>
      {rewards.length === 0 && <p className="muted small">貯まったら使いたいごほうびを登録しておきましょう。</p>}
      <ul className="reward-list">
        {rewards.map((r) => (
          <li key={r.id}>
            <div>
              <strong>{r.name}</strong>
              <span className="muted small">{yen(r.price)}</span>
            </div>
            {balance >= r.price ? (
              <button
                className="primary-btn"
                onClick={() => confirm(`「${r.name}」に ${yen(r.price)} 使いますか？`) && props.onBuy(r)}
              >
                買った
              </button>
            ) : (
              <span className="muted small">あと {yen(r.price - balance)}</span>
            )}
            <button className="icon-btn" aria-label="削除" onClick={() => confirm(`「${r.name}」を消しますか？`) && props.onDeleteReward(r.id)}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <form className="reward-form" onSubmit={addReward}>
        <input placeholder="例：カフェでケーキ" value={name} onChange={(e) => setName(e.target.value)} aria-label="ごほうびの名前" />
        <input
          placeholder="1000"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          aria-label="金額"
        />
        <span>円</span>
        <button className="sub-btn" type="submit" disabled={!name.trim() || !Number(price.replace(/[^\d]/g, ''))}>
          追加
        </button>
      </form>

      <h3 className="section-title">お金の出入り</h3>
      <ul className="history">
        {(showAll ? history : history.slice(0, HISTORY)).map((h) => (
          <li key={h.key}>
            <div className="history-row">
              <span className="muted small">{md(h.at)}</span>
              <span>{h.label}</span>
              <strong className={h.amount < 0 ? 'minus' : 'plus'}>
                {h.amount > 0 ? '+' : '−'}
                {yen(Math.abs(h.amount))}
              </strong>
            </div>
            {h.detail.length > 0 && (
              <p className="muted small">{h.detail.map((l) => `${l.label} +${l.amount}`).join('・')}</p>
            )}
          </li>
        ))}
      </ul>

      {!showAll && history.length > HISTORY && (
        <button className="link-btn small more" onClick={() => setShowAll(true)}>
          もっと見る（全 {history.length} 件）
        </button>
      )}

      <details className="earn-rules">
        <summary className="small">お金のもらい方</summary>
        <ul className="small">
          <li>1問正解：+10円</li>
          <li>今日の目標を達成：+100円</li>
          <li>連続ボーナス：+5円 × 連続日数（最大 +150円）</li>
          <li>目標を達成した日の正答率が 80% 以上：+50円</li>
          <li>目標を超えて 10問ごと：+50円</li>
          <li>30日連続ごと：+1,000円</li>
        </ul>
      </details>
    </section>
  )
}

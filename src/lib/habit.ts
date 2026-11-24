import type { AnswerLog } from '../types'

/** 端末の時刻での日付（YYYY-MM-DD） */
export function localDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function daysBefore(date: string, n: number) {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() - n)
  return localDate(d)
}

export interface Daily {
  today: number
  goal: number
  /** 目標を達成した日が何日続いているか（今日がまだなら昨日まで） */
  streak: number
  doneToday: boolean
}

export function daily(logs: AnswerLog[], goal: number, now = new Date()): Daily {
  const counts = new Map<string, number>()
  for (const l of logs) {
    const day = localDate(new Date(l.at))
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  const today = localDate(now)
  const reached = (day: string) => (counts.get(day) ?? 0) >= goal
  const doneToday = reached(today)
  let streak = 0
  for (let n = doneToday ? 0 : 1; reached(daysBefore(today, n)); n++) streak++
  return { today: counts.get(today) ?? 0, goal, streak, doneToday }
}

// ── 効果音・振動 ─────────────────────────────────

let ctx: AudioContext | null = null

function tone(freq: number, start: number, length: number, type: OscillatorType = 'sine', volume = 0.18) {
  ctx ??= new AudioContext()
  const t = ctx.currentTime + start
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + length + 0.05)
}

const vibrate = (pattern: number | number[]) => navigator.vibrate?.(pattern)

/** 正解: コンボが続くほど音が高くなる */
export function correctFeedback(combo: number, sound: boolean) {
  vibrate(35)
  if (!sound) return
  const step = Math.min(combo - 1, 8)
  const base = 660 * Math.pow(2, step / 12)
  tone(base, 0, 0.12)
  tone(base * 1.5, 0.08, 0.22)
}

export function wrongFeedback(sound: boolean) {
  vibrate([60, 60, 60])
  if (!sound) return
  tone(196, 0, 0.18, 'triangle', 0.12)
  tone(165, 0.12, 0.25, 'triangle', 0.12)
}

/** 今日の目標達成 */
export function goalFeedback(sound: boolean) {
  vibrate([80, 60, 80, 60, 160])
  if (!sound) return
  ;[523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.3, 'sine', 0.16))
}

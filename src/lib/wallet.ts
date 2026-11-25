import type { AnswerLog } from '../types'
import { localDate } from './habit'

/**
 * ごほうび貯金。解いた記録からかせいだお金を計算し、使ったお金・もらったボーナスは別に記録する。
 * 毎日 10 問（8 問正解）を 30 日続けると、PROGOS の受験料（10,000 円）ほどが貯まるように決めてある。
 */
export const EARN = {
  correct: 10,
  goal: 100,
  streakPerDay: 5,
  streakMax: 150,
  accuracy: 50,
  /** 目標を超えて 10 問ごと */
  extra: 50,
  /** 30 日連続ごと */
  month: 1000,
}
const ACCURACY_LINE = 0.8
const MONTH = 30

export interface Line {
  label: string
  amount: number
}

export interface DayEarning {
  date: string
  count: number
  correct: number
  lines: Line[]
  total: number
}

function prevDate(date: string) {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() - 1)
  return localDate(d)
}

/** 日ごとにかせいだお金（古い日から） */
export function earnings(logs: AnswerLog[], goal: number): DayEarning[] {
  const byDay = new Map<string, { count: number; correct: number }>()
  for (const l of logs) {
    const day = localDate(new Date(l.at))
    const d = byDay.get(day) ?? { count: 0, correct: 0 }
    d.count++
    if (l.correct) d.correct++
    byDay.set(day, d)
  }
  const days: DayEarning[] = []
  let streak = 0
  let lastGoalDay = ''
  for (const date of [...byDay.keys()].sort()) {
    const { count, correct } = byDay.get(date)!
    const lines: Line[] = []
    if (correct) lines.push({ label: `正解 ${correct}問`, amount: correct * EARN.correct })
    if (count >= goal) {
      streak = lastGoalDay === prevDate(date) ? streak + 1 : 1
      lastGoalDay = date
      lines.push({ label: '今日の目標達成', amount: EARN.goal })
      lines.push({ label: `${streak}日連続ボーナス`, amount: Math.min(EARN.streakPerDay * streak, EARN.streakMax) })
      if (correct / count >= ACCURACY_LINE)
        lines.push({ label: `正答率 ${Math.round((correct / count) * 100)}%`, amount: EARN.accuracy })
      const extra = Math.floor((count - goal) / 10)
      if (extra > 0) lines.push({ label: `たくさんやった（+${extra * 10}問）`, amount: extra * EARN.extra })
      if (streak % MONTH === 0) lines.push({ label: `🎉 ${streak}日連続達成`, amount: EARN.month })
    }
    days.push({ date, count, correct, lines, total: lines.reduce((s, x) => s + x.amount, 0) })
  }
  return days
}

// ── 使ったお金・ボーナス ─────────────────────────

export interface Reward {
  id: string
  name: string
  price: number
}

export interface Entry {
  id: string
  at: string
  label: string
  /** 使ったらマイナス、ボーナスはプラス */
  amount: number
}

export const PROGOS_PRICE = 10000
export const LEVELS = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
export type Level = (typeof LEVELS)[number]

/** PROGOS の結果によるボーナス（どれも受験料より多い） */
export function progosBonus(result: Level, last: Level, best: Level): { amount: number; label: string } {
  const r = LEVELS.indexOf(result)
  if (r >= LEVELS.indexOf('B2') && LEVELS.indexOf(best) < LEVELS.indexOf('B2'))
    return { amount: 20000, label: `PROGOS ${result}（初の B2 以上！）` }
  if (r > LEVELS.indexOf(last)) return { amount: 15000, label: `PROGOS ${result}（${last} からレベルアップ）` }
  if (r === LEVELS.indexOf(last)) return { amount: 12000, label: `PROGOS ${result}（レベル維持）` }
  return { amount: 11000, label: `PROGOS ${result}（受験ボーナス）` }
}

export const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`

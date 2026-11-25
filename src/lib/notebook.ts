import type { AnswerLog, Drill, Problem } from '../types'

/**
 * 苦手ノートと成績表。
 * - 苦手ノート: 1 回でも間違えた問題。そのあと続けて GRADUATE 回正解すると「卒業」
 *   問題の中身（日本語・模範解答・語彙）は間違えたときにコピーしておくので、元のドリルが消えても解ける
 * - 成績表: ドリルごとの結果。ドリルの問題数だけ覚えておけば、あとは解いた記録から計算できる
 */
export const GRADUATE = 3

/** 苦手ノートに入れた問題の中身 */
export interface Snapshot {
  id: string
  at: string
  problem: Problem
}

/** 成績表のために覚えておくドリルの情報 */
export interface DrillMeta {
  name: string
  label: string
  total: number
}

export interface NoteStatus {
  /** 間違えた回数 */
  wrong: number
  /** 最後に間違えてから続けて正解した回数 */
  streak: number
  graduated: boolean
  /** 卒業した時刻 */
  graduatedAt?: string
}

/** 苦手ノートに入っている問題（1 回でも間違えた問題）とその状態 */
export function notebook(logs: AnswerLog[]): Map<string, NoteStatus> {
  const map = new Map<string, NoteStatus>()
  for (const l of logs) {
    const s = map.get(l.problemId)
    if (!l.correct) {
      map.set(l.problemId, { wrong: (s?.wrong ?? 0) + 1, streak: 0, graduated: false })
    } else if (s && !s.graduated) {
      const streak = s.streak + 1
      map.set(l.problemId, { ...s, streak, graduated: streak >= GRADUATE, graduatedAt: streak >= GRADUATE ? l.at : undefined })
    }
  }
  return map
}

export const metaOf = (d: Drill): DrillMeta => ({ name: d.name, label: d.label, total: d.problems.length })

export interface DrillReport extends DrillMeta {
  /** 1 回でも解いた問題の数 */
  tried: number
  /** 1 回目で正解した数 */
  firstCorrect: number
  /** 何回目かで正解できた数 */
  finalCorrect: number
}

/** ドリルごとの成績（新しいドリルが先頭）。1 問も解いていないドリルは出さない */
export function drillReports(metas: DrillMeta[], logs: AnswerLog[]): DrillReport[] {
  const byProblem = new Map<string, boolean[]>()
  for (const l of logs) byProblem.set(l.problemId, [...(byProblem.get(l.problemId) ?? []), l.correct])
  return [...metas]
    .sort((a, b) => b.name.localeCompare(a.name))
    .map((m) => {
      const results = [...byProblem].filter(([id]) => id.startsWith(`${m.name}-`)).map(([, r]) => r)
      return {
        ...m,
        tried: results.length,
        firstCorrect: results.filter((r) => r[0]).length,
        finalCorrect: results.filter((r) => r.includes(true)).length,
      }
    })
    .filter((r) => r.tried > 0)
}

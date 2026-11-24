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

/** 1 日の量に応じたブロック（マイクラ風） */
export type Block = 'air' | 'dirt' | 'grass' | 'gold' | 'diamond'

export function blockFor(count: number, goal: number): Block {
  if (count === 0) return 'air'
  if (count < goal) return 'dirt'
  if (count < goal * 2) return 'grass'
  if (count < goal * 3) return 'gold'
  return 'diamond'
}

export interface History {
  /** 日付 → その日に解いた数 */
  counts: Map<string, number>
  /** 今の連続日数（今日がまだなら昨日まで） */
  streak: number
  /** これまでで一番長い連続日数 */
  longest: number
  /** 1 日に解いた数の最高記録 */
  bestDay: { date: string; count: number } | null
  /** 1 問でも解いた日の数 */
  activeDays: number
  total: number
}

export function history(logs: AnswerLog[], goal: number, now = new Date()): History {
  const counts = new Map<string, number>()
  for (const l of logs) {
    const day = localDate(new Date(l.at))
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  let bestDay: History['bestDay'] = null
  for (const [date, count] of counts) if (!bestDay || count > bestDay.count) bestDay = { date, count }

  // 目標を達成した日が続いた一番長い期間
  const reachedDays = [...counts].filter(([, c]) => c >= goal).map(([d]) => d).sort()
  let longest = 0
  let run = 0
  reachedDays.forEach((d, i) => {
    run = i > 0 && daysBefore(d, 1) === reachedDays[i - 1] ? run + 1 : 1
    longest = Math.max(longest, run)
  })

  return {
    counts,
    streak: daily(logs, goal, now).streak,
    longest,
    bestDay,
    activeDays: counts.size,
    total: logs.length,
  }
}

/** 今日を含む最近 weeks 週ぶんの日付（日曜始まり、週ごとの配列）。未来の日は null */
export function calendarWeeks(weeks: number, now = new Date()): (string | null)[][] {
  const today = localDate(now)
  const start = new Date(`${today}T12:00:00`)
  start.setDate(start.getDate() - start.getDay() - (weeks - 1) * 7)
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = new Date(start)
      day.setDate(start.getDate() + w * 7 + d)
      const date = localDate(day)
      return date > today ? null : date
    }),
  )
}

// ── 効果音・振動 ─────────────────────────────────
//
// 音はすべてその場で合成する（音声ファイルは使わない）。
// 正解は「ベルの和音がきらきらと上がっていき、ホールのように響く」音。コンボが続くほど少しずつ高くなり、
// 5 の倍数のコンボでは低音と和音を足したファンファーレになる。

const semitone = (f: number, n: number) => f * Math.pow(2, n / 12)

/** ベルのような音（基音＋倍音が、高い音ほど早く消える） */
function bell(ac: BaseAudioContext, out: AudioNode, freq: number, t: number, length = 1.6, volume = 0.14) {
  for (const [mult, amp] of [
    [1, 1],
    [2, 0.4],
    [3, 0.16],
    [4.2, 0.07],
  ]) {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.frequency.value = freq * mult
    const end = t + length / Math.sqrt(mult)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(volume * amp, t + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    osc.connect(gain).connect(out)
    osc.start(t)
    osc.stop(end + 0.05)
  }
}

/** やわらかく伸びる音（和音の土台） */
function pad(ac: BaseAudioContext, out: AudioNode, freq: number, t: number, length: number, volume = 0.05) {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'triangle'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.12)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
  osc.connect(gain).connect(out)
  osc.start(t)
  osc.stop(t + length + 0.05)
}

/** ホールのような響き（ノイズを減衰させた残響）。直接音と響きを混ぜた出力先を返す */
function hall(ac: BaseAudioContext, dest: AudioNode, wet = 0.32): AudioNode {
  const input = ac.createGain()
  const seconds = 2.2
  const impulse = ac.createBuffer(2, Math.floor(ac.sampleRate * seconds), ac.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.6)
  }
  const reverb = ac.createConvolver()
  reverb.buffer = impulse
  const wetGain = ac.createGain()
  wetGain.gain.value = wet
  input.connect(dest)
  input.connect(reverb).connect(wetGain).connect(dest)
  return input
}

/** 正解の音。combo は連続正解の数 */
export function playCorrect(ac: BaseAudioContext, dest: AudioNode, combo: number, t0 = ac.currentTime) {
  const out = hall(ac, dest)
  const root = semitone(523.25, Math.min(Math.max(combo - 1, 0), 7)) // ド。コンボで最大 7 半音上がる
  const big = combo >= 5 && combo % 5 === 0
  // ド・ミ・ソ・ド をすばやく上がる
  ;[0, 4, 7, 12].forEach((n, i) => bell(ac, out, semitone(root, n), t0 + i * 0.065, 1.4, 0.13))
  // 最後にきらっと光る高い音
  bell(ac, out, semitone(root, 24), t0 + 0.3, 1.1, 0.06)
  bell(ac, out, semitone(root, 28), t0 + 0.36, 0.9, 0.04)
  if (big) {
    // 節目のコンボ: 低音と和音を重ねて、もう一段上がる
    pad(ac, out, semitone(root, -12), t0 + 0.28, 2.2, 0.07)
    ;[0, 4, 7, 11].forEach((n) => pad(ac, out, semitone(root, n), t0 + 0.3, 2.0, 0.035))
    ;[16, 19, 24].forEach((n, i) => bell(ac, out, semitone(root, n), t0 + 0.42 + i * 0.08, 1.6, 0.08))
  }
}

export function playWrong(ac: BaseAudioContext, dest: AudioNode, t0 = ac.currentTime) {
  const out = hall(ac, dest, 0.15)
  ;[
    [196, 0],
    [165, 0.14],
  ].forEach(([f, d]) => {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'triangle'
    osc.frequency.value = f
    gain.gain.setValueAtTime(0.0001, t0 + d)
    gain.gain.exponentialRampToValueAtTime(0.11, t0 + d + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.28)
    osc.connect(gain).connect(out)
    osc.start(t0 + d)
    osc.stop(t0 + d + 0.35)
  })
}

/** 今日の目標達成のファンファーレ */
export function playGoal(ac: BaseAudioContext, dest: AudioNode, t0 = ac.currentTime) {
  const out = hall(ac, dest, 0.38)
  const root = 523.25
  // ソ・ド・ミ・ソ … ド！
  ;[-5, 0, 4, 7].forEach((n, i) => bell(ac, out, semitone(root, n), t0 + i * 0.12, 1.2, 0.12))
  const hit = t0 + 0.55
  pad(ac, out, semitone(root, -12), hit, 2.8, 0.08)
  ;[0, 4, 7, 12].forEach((n) => pad(ac, out, semitone(root, n), hit, 2.6, 0.04))
  ;[12, 16, 19, 24].forEach((n, i) => bell(ac, out, semitone(root, n), hit + i * 0.05, 2.0, 0.1))
  ;[28, 31, 36].forEach((n, i) => bell(ac, out, semitone(root, n), hit + 0.35 + i * 0.09, 1.2, 0.04))
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
/** スマホのスピーカーでも聞こえやすいよう、全体の音量を少し上げる（最大でも割れない大きさ） */
const MASTER_VOLUME = 1.5

const audio = () => {
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = MASTER_VOLUME
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}
const out = () => (audio(), master!)

const vibrate = (pattern: number | number[]) => navigator.vibrate?.(pattern)

export function correctFeedback(combo: number, sound: boolean) {
  vibrate(combo >= 5 && combo % 5 === 0 ? [40, 50, 80] : 35)
  if (sound) playCorrect(audio(), out(), combo)
}

export function wrongFeedback(sound: boolean) {
  vibrate([60, 60, 60])
  if (sound) playWrong(audio(), out())
}

/** 今日の目標達成 */
export function goalFeedback(sound: boolean) {
  vibrate([80, 60, 80, 60, 160])
  if (sound) playGoal(audio(), out())
}

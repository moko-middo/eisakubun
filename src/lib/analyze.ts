import type { Placed, Problem, Token } from '../types'
import { matches, normalize } from './problem'

export type MistakeKind = '綴り' | '語形' | '別の語' | '語順' | '使い忘れ'

export interface Finding {
  kind: MistakeKind
  /** 何がどう違ったか */
  message: string
  /** 文法のコツ（当てはまるときだけ） */
  tip?: string
  /** 集計用: 間違えた語（模範解答の形） */
  word: string
}

// ── 入力した語の間違い ────────────────────────────

function editDistance(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}

const ENDING = /^(?:ing|ed|d|s|es|ies|ied|y|e|en|n|er|est|ly)?$/

/** 語尾だけが違う（have → having、develop → developed など）なら、どんな形にすべきかの説明を返す */
function formTip(expected: string, got: string): string | null {
  let p = 0
  while (p < expected.length && p < got.length && expected[p] === got[p]) p++
  const e = expected.slice(p)
  const g = got.slice(p)
  if (p < 3 || e.length > 4 || g.length > 4 || !ENDING.test(e) || !ENDING.test(g)) return null
  if (/ing$/.test(expected)) return '-ing 形にする（進行形、前置詞のあと、動名詞など）'
  if (/ed$/.test(expected)) return '過去形・過去分詞にする'
  if (/s$/.test(expected) && !/s$/.test(got)) return '-s を付ける（三人称単数の現在形、または複数形）'
  if (!/s$/.test(expected) && /s$/.test(got)) return '-s は付けない'
  return '語尾（活用・品詞の形）を確認'
}

function typedFinding(token: Token, got: string): Finding {
  const expected = token.accepts[0]
  const g = normalize(got)
  const words = expected.split(' ')
  const gotWords = g.split(' ')
  // 語句（bleed a radiator など）は、違っている 1 語で判定する
  const k = words.findIndex((w, i) => w !== gotWords[i])
  const ew = words.length === gotWords.length && k >= 0 ? words[k] : expected
  const gw = words.length === gotWords.length && k >= 0 ? gotWords[k] : g
  const tip = formTip(ew, gw)
  if (tip) return { kind: '語形', message: `${got} → ${expected}`, tip, word: expected }
  if (editDistance(ew, gw) <= Math.max(1, Math.floor(ew.length / 4)))
    return { kind: '綴り', message: `${got} → ${expected}`, word: expected }
  return { kind: '別の語', message: `${got} ではなく ${expected}（${token.gloss}）`, word: expected }
}

// ── 並べ順の間違い ──────────────────────────────

const FREQUENCY = new Set(
  'always usually often sometimes never rarely seldom hardly just already still also only even almost really finally'.split(' '),
)
const AUXILIARY = new Set(
  'do does did can could will would should shall may might must is are was were am have has had'.split(' '),
)
const PREPOSITION = new Set(
  'in on at to for with by from of about into onto over under after before during until through across along around behind near off up down out'.split(
    ' ',
  ),
)
const TIME = new Set('yesterday today tonight tomorrow now then later soon early recently overnight'.split(' '))
// so は「とても」の意味もあるので入れない
const CONNECTOR = new Set('and but or because if when while although though that which who where'.split(' '))

function orderTip(word: string, question: boolean, before?: string): string | undefined {
  const w = word.split(' ')[0]
  // 疑問文で、助動詞そのもの、または文頭の助動詞のすぐあとの語（主語）の位置を間違えたとき
  if (question && (AUXILIARY.has(w) || (before !== undefined && AUXILIARY.has(before)))) return '疑問文では、助動詞・be動詞（can / do / is など）を主語の前に出す'
  if (FREQUENCY.has(w)) return '頻度・程度の副詞（always / just / finally など）は、一般動詞の前、be動詞・助動詞のあとに置く'
  if (TIME.has(w) || w === 'every' || /^(?:on|at|in) (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.test(word))
    return '時を表す語句は、ふつう文の最後（場所 → 時 の順）'
  if (PREPOSITION.has(w)) return '前置詞は後ろの名詞とセット。動詞との組み合わせ（look for / pull into など）にも注意'
  if (CONNECTOR.has(w)) return '接続詞・関係詞は、つなぐ文のいちばん前に置く'
  return undefined
}

/** 2 つの並びの最長共通部分列（どの位置どうしが対応しているか） */
function lcs(a: string[], b: string[]): [number, number][] {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const pairs: [number, number][] = []
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) pairs.push([i++, j++])
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return pairs
}

const show = (t: Token) => (t.prefix ? `${t.prefix} ${t.display}` : t.display).replace(/[.,;:?!]+$/, '')

/** 答えを模範解答と比べて、どこをどう間違えたかを返す */
export function analyze(problem: Problem, placed: Placed[]): Finding[] {
  const tokens = problem.tokens
  const findings: Finding[] = []
  const question = /\?$/.test(tokens[tokens.length - 1]?.display ?? '')

  // 入力した語
  for (const t of tokens.filter((t) => t.gloss)) {
    const p = placed.find((x) => x.gloss === t.gloss)
    if (!p) findings.push({ kind: '使い忘れ', message: `「${t.gloss}」（${show(t)}）を入れていない`, word: t.accepts[0] })
    else if (!matches(t, p.text)) findings.push(typedFinding(t, p.text))
  }

  // 並べ順（入力した語は、綴りが違っても位置だけで比べる）
  const key = (x: { gloss?: string; text: string }) => (x.gloss ? `✎${x.gloss}` : normalize(x.text))
  const expected = tokens.map((t) => key({ gloss: t.gloss, text: t.accepts[0] }))
  const got = placed.map(key)
  const pairs = lcs(got, expected)
  const okGot = new Set(pairs.map(([g]) => g))
  const okExp = new Set(pairs.map(([, e]) => e))
  const usedExp = new Set<number>()
  const moved: { gi: number; ei: number }[] = []
  got.forEach((k, gi) => {
    if (okGot.has(gi)) return
    const ei = expected.findIndex((x, i) => x === k && !okExp.has(i) && !usedExp.has(i))
    if (ei >= 0) {
      usedExp.add(ei)
      moved.push({ gi, ei })
    }
  })
  const reported = new Set<number>()
  for (const m of moved) {
    if (reported.has(m.ei)) continue
    const t = tokens[m.ei]
    // 隣どうしが入れ替わっているだけなら 1 つにまとめる
    const swap = moved.find((o) => o !== m && o.gi === m.gi + 1 && o.ei === m.ei - 1)
    if (swap) {
      reported.add(swap.ei)
      findings.push({
        kind: '語順',
        message: `「${show(tokens[swap.ei])}」と「${show(t)}」の順番が逆`,
        tip: orderTip(normalize(show(tokens[swap.ei])), question) ?? orderTip(normalize(show(t)), question),
        word: normalize(show(t)),
      })
      continue
    }
    const where = m.ei === 0 ? '文の最初' : `「${show(tokens[m.ei - 1])}」のあと`
    const before = m.ei === 1 ? normalize(show(tokens[0])).split(' ')[0] : undefined
    findings.push({ kind: '語順', message: `「${show(t)}」は${where}`, tip: orderTip(normalize(show(t)), question, before), word: normalize(show(t)) })
  }

  // 使わなかったカード
  const usedTiles = new Set([...okExp, ...usedExp])
  const unused = tokens.filter((t, i) => !t.gloss && !usedTiles.has(i))
  if (unused.length)
    findings.push({ kind: '使い忘れ', message: `使っていないカード: ${unused.map(show).join(' / ')}`, word: normalize(show(unused[0])) })

  return findings
}

// ── 記録からの集計 ──────────────────────────────

export interface Summary {
  mistakes: number
  byKind: { kind: MistakeKind; count: number }[]
  /** 何度も間違えた語（入力式） */
  words: { word: string; count: number; kinds: MistakeKind[] }[]
  /** 何度も位置を間違えた語 */
  order: { word: string; count: number }[]
  tips: { tip: string; count: number }[]
}

export function summarize(items: { problem: Problem; placed: Placed[] }[]): Summary {
  const kinds = new Map<MistakeKind, number>()
  const words = new Map<string, { count: number; kinds: Set<MistakeKind> }>()
  const order = new Map<string, number>()
  const tips = new Map<string, number>()
  for (const { problem, placed } of items) {
    for (const f of analyze(problem, placed)) {
      kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1)
      if (f.tip) tips.set(f.tip, (tips.get(f.tip) ?? 0) + 1)
      if (f.kind === '語順') order.set(f.word, (order.get(f.word) ?? 0) + 1)
      else if (f.kind !== '使い忘れ') {
        const w = words.get(f.word) ?? { count: 0, kinds: new Set() }
        w.count++
        w.kinds.add(f.kind)
        words.set(f.word, w)
      }
    }
  }
  const sorted = <T,>(m: Map<T, number>) => [...m].sort((a, b) => b[1] - a[1])
  return {
    mistakes: items.length,
    byKind: sorted(kinds).map(([kind, count]) => ({ kind, count })),
    words: [...words]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([word, v]) => ({ word, count: v.count, kinds: [...v.kinds] })),
    order: sorted(order).map(([word, count]) => ({ word, count })),
    tips: sorted(tips).map(([tip, count]) => ({ tip, count })),
  }
}

/** Gemini や Claude に貼り付けて詳しく解説してもらうための文章 */
export function aiPrompt(items: { problem: Problem; placed: Placed[] }[]) {
  const lines = [
    '英作文アプリ（日本語を見て、英文を並べ替えと入力で組み立てる）で間違えた問題です。',
    'イギリス英語の日常表現を練習しています。冠詞（a / the）は気にしていません。',
    '私の間違いの傾向を分析して、なぜ間違えやすいのか、どう覚えればいいかを日本語でわかりやすく解説してください。',
    '',
  ]
  items.forEach(({ problem, placed }, i) => {
    const answer = problem.tokens.map(show).join(' ')
    lines.push(`${i + 1}. 日本語: ${problem.ja}`)
    lines.push(`   正解: ${answer}`)
    lines.push(`   私の答え: ${placed.map((p) => p.text).join(' ')}`)
    const f = analyze(problem, placed)
    if (f.length) lines.push(`   自動分析: ${f.map((x) => `[${x.kind}] ${x.message}`).join(' / ')}`)
    lines.push('')
  })
  return lines.join('\n')
}

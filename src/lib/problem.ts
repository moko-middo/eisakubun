import type { Card, Problem, Token } from '../types'

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,;:?!"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** 文頭の大文字は答えのヒントになるので、カードでは小文字にする（I は除く） */
function cardLabel(display: string, first: boolean) {
  const text = display.replace(/[.,;:?!]+$/, '')
  return first && !/^I\b/.test(text) ? text[0].toLowerCase() + text.slice(1) : text
}

export function shuffle<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function makeCards(tokens: Token[]): Card[] {
  const cards: Omit<Card, 'id'>[] = tokens.map((t, i) =>
    t.gloss
      ? { label: t.gloss, typed: true, prefix: t.prefix && (i === 0 ? t.prefix.toLowerCase() : t.prefix) }
      : { label: cardLabel(t.display, i === 0), typed: false },
  )
  // 正解の順に並んでしまったら混ぜ直す
  let order = shuffle(cards.map((_, i) => i))
  while (cards.length > 2 && order.every((v, i) => v === i)) order = shuffle(order)
  return order.map((i, id) => ({ ...cards[i], id }))
}

export interface Grade {
  correct: boolean
  /** 並べた各位置が模範解答と一致しているか */
  positions: boolean[]
}

const withoutArticles = (s: string) =>
  s
    .split(' ')
    .filter((w) => !/^(?:a|an|the)$/.test(w))
    .join(' ')

/** 入力した語が合っているか。冠詞は覚える対象にしないので、入力式の中の a / the の有無や違いは問わない */
export function matches(token: Token, value: string) {
  const w = normalize(value)
  if (token.accepts.includes(w)) return true
  return !!token.gloss && token.accepts.some((a) => withoutArticles(a) === withoutArticles(w))
}

/** 文頭・文末のどちらに置いてもよい語句（時・場所・条件など）の始まりの語 */
const MOVABLE = new Set(
  'at in on during every last next this yesterday today tonight tomorrow when while if because although though once unless after before since until'.split(
    ' ',
  ),
)
/** 文の中にこれがあると節が 2 つ以上あるので、語句を動かすと意味や文法が崩れやすい */
const CLAUSE = new Set(
  'and but or so if when while because that until before after unless although though which who where whether than then'.split(' '),
)
/** 文と文をつなぐ語。文頭の語句は、この前（前半の文の終わり）に移してもよい */
const JOIN = new Set(['and', 'but', 'so', 'or'])
/** 時を表す語句か（every Sunday morning / at exactly nine o'clock / last night / on Thursday など） */
const TIME_START = new Set('every last next this yesterday today tonight tomorrow'.split(' '))
const TIME_WORD =
  /^(?:\d+|o'clock|morning|afternoon|evening|night|noon|midnight|weekend|week|month|year|day|half|quarter|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|christmas|easter|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/
function isTime(phrase: Token[]) {
  const ws = words(phrase)
  return TIME_START.has(ws[0]) || (['at', 'on', 'in', 'during'].includes(ws[0]) && ws.slice(1).some((w) => TIME_WORD.test(w)))
}

/** 「, so」「, but」のように、読点のあとで次の文を始める語 */
const SPLIT = new Set([...JOIN, 'because', 'although', 'though', 'while', 'when', 'if', 'unless', 'until', 'before', 'after'])
/** 直後の語句と結びついている語（almost every morning など） */
const BOUND = new Set('almost nearly only just about around roughly even'.split(' '))

const firstWord = (t: Token) => normalize(t.prefix ?? t.display).split(' ')[0]
const words = (ts: Token[]) => ts.flatMap((t) => normalize(t.prefix ? `${t.prefix} ${t.display}` : t.display).split(' '))

/**
 * 模範解答のほかに正解にする語順。
 * - 文頭の「On Boxing Day,」のような語句を文末、または and / but の前に回したもの
 * - 文末の「at the Christmas market」のような短い語句（5 語まで）を文頭に出したもの。
 *   「, so」「, but」などでつながった文では、それぞれの文の中でだけ動かす（文をまたぐと意味が変わるため）
 */
export function otherOrders(tokens: Token[]): Token[][] {
  const n = tokens.length
  const out: Token[][] = []
  if (MOVABLE.has(firstWord(tokens[0]))) {
    for (let k = 1; k <= Math.min(6, n - 2); k++) {
      if (/,$/.test(tokens[k - 1].display)) {
        const phrase = tokens.slice(0, k)
        const rest = tokens.slice(k)
        out.push([...rest, ...phrase])
        // 「…, and then …」の前（前半の文の終わり）に入れてもよい
        rest.forEach((t, j) => {
          if (j > 0 && JOIN.has(firstWord(t))) out.push([...rest.slice(0, j), ...phrase, ...rest.slice(j)])
        })
        break
      }
    }
  }
  // 「…, so …」「…, but …」のように 2 つの文がつながっているときは、それぞれの文の中で考える
  const starts = [0]
  for (let i = 1; i < n; i++) if (/,$/.test(tokens[i - 1].display) && SPLIT.has(firstWord(tokens[i]))) starts.push(i)
  starts.forEach((s, si) => {
    const e = starts[si + 1] ?? n
    const lead = s > 0 ? s + 1 : 0 // 後ろの文の先頭の so / but などは動かさない
    for (let k = e - 1; k >= Math.max(lead + 2, e - 5); k--) {
      const chunk = tokens.slice(k, e)
      const rest = tokens.slice(lead, k)
      if (!MOVABLE.has(firstWord(tokens[k]))) continue
      if (chunk.slice(1).some((t) => MOVABLE.has(firstWord(t)))) continue // around cups of … at the market のようにまとまりが切れる
      if (rest.some((t) => /[,.?!;:]$/.test(t.display))) continue // 文がさらに分かれている・読点がある
      if (words(rest).some((w) => CLAUSE.has(w))) continue
      if (BOUND.has(words(rest)[words(rest).length - 1])) continue
      out.push([...tokens.slice(0, lead), ...chunk, ...rest, ...tokens.slice(e)])
    }
    // 文の最後に時・場所の語句が 2 つ続くとき（… every Sunday morning at exactly nine o'clock）は、
    // 2 つの順番を入れ替えても、どちらか（または両方）を文の頭に出してもよい
    // ただし、どちらも「時」を表す語句のときだけ（in ink や on a breadstick のように動詞と結びついた語句は動かさない）
    const isPhrase = (from: number, to: number) =>
      to - from <= 5 &&
      MOVABLE.has(firstWord(tokens[from])) &&
      !tokens.slice(from + 1, to).some((t) => MOVABLE.has(firstWord(t))) &&
      isTime(tokens.slice(from, to))
    for (let k2 = e - 1; k2 >= Math.max(lead + 3, e - 5); k2--) {
      if (!isPhrase(k2, e)) continue
      for (let k1 = k2 - 1; k1 >= Math.max(lead + 2, k2 - 5); k1--) {
        if (!isPhrase(k1, k2)) continue
        const rest = tokens.slice(lead, k1)
        if (rest.some((t) => /[,.?!;:]$/.test(t.display))) break
        if (words(rest).some((w) => CLAUSE.has(w)) || BOUND.has(words(rest)[words(rest).length - 1])) break
        const a = tokens.slice(k1, k2)
        const b = tokens.slice(k2, e)
        const head = tokens.slice(0, lead)
        const tail = tokens.slice(e)
        for (const order of [
          [...rest, ...b, ...a],
          [...b, ...rest, ...a],
          [...a, ...rest, ...b],
          [...a, ...b, ...rest],
          [...b, ...a, ...rest],
        ])
          out.push([...head, ...order, ...tail])
        break
      }
    }
  })
  return out
}

const sameOrder = (tokens: Token[], got: string[]) =>
  got.join(' ') === tokens.map((t) => t.accepts[0]).join(' ') ||
  (got.length === tokens.length && got.every((w, i) => matches(tokens[i], w)))

/** answer: 並べた順の語（入力式は入力した文字） */
export function grade(tokens: Token[], answer: string[]): Grade {
  const got = answer.map(normalize)
  // 同じ語のカードが 2 枚あるときなどは、置いた語の並びが模範解答と同じなら正解
  const correct = sameOrder(tokens, got) || otherOrders(tokens).some((order) => sameOrder(order, got))
  const positions = got.map((w, i) => (tokens[i] ? matches(tokens[i], w) : false))
  return { correct, positions: correct ? got.map(() => true) : positions }
}

export function prepare(p: Problem) {
  return { tokens: p.tokens, cards: makeCards(p.tokens) }
}

/** ヒント: 各語の最初の文字だけ見せる（例: booking reference → b······ r········） */
export function hintFor(answer: string) {
  return answer.replace(/\S+/g, (w) => w[0] + '·'.repeat(w.length - 1))
}

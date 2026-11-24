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
/** 直後の語句と結びついている語（almost every morning など） */
const BOUND = new Set('almost nearly only just about around roughly even'.split(' '))

const firstWord = (t: Token) => normalize(t.prefix ?? t.display).split(' ')[0]
const words = (ts: Token[]) => ts.flatMap((t) => normalize(t.prefix ? `${t.prefix} ${t.display}` : t.display).split(' '))

/**
 * 模範解答のほかに正解にする語順。
 * - 文頭の「Every Bonfire Night,」のような語句を文末に回したもの
 * - 文末の「at the Christmas market」のような短い語句（5 語まで）を文頭に出したもの。
 *   ただし、節が 1 つだけの文に限る（2 つ以上あると、どこに掛かる語句か変わってしまうため）
 */
function otherOrders(tokens: Token[]): Token[][] {
  const n = tokens.length
  const out: Token[][] = []
  if (MOVABLE.has(firstWord(tokens[0]))) {
    for (let k = 1; k <= Math.min(6, n - 2); k++) {
      if (/,$/.test(tokens[k - 1].display)) {
        out.push([...tokens.slice(k), ...tokens.slice(0, k)])
        break
      }
    }
  }
  for (let k = n - 1; k >= Math.max(2, n - 5); k--) {
    const chunk = tokens.slice(k)
    const rest = tokens.slice(0, k)
    if (!MOVABLE.has(firstWord(tokens[k]))) continue
    if (chunk.slice(1).some((t) => MOVABLE.has(firstWord(t)))) continue // around cups of … at the market のようにまとまりが切れる
    if (rest.some((t) => /[,.?!;:]$/.test(t.display))) continue // 文が 2 つ以上・読点がある
    if (words(rest).some((w) => CLAUSE.has(w))) continue
    if (BOUND.has(words(rest)[words(rest).length - 1])) continue
    out.push([...chunk, ...rest])
  }
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

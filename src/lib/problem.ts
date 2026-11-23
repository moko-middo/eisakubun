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
    t.gloss ? { label: t.gloss, typed: true } : { label: cardLabel(t.display, i === 0), typed: false },
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

/** answer: 並べた順の語（入力式は入力した文字） */
export function grade(tokens: Token[], answer: string[]): Grade {
  const got = answer.map(normalize)
  // 同じ語のカードが 2 枚あるときなどは、置いた語の並びが模範解答と同じなら正解
  const correct = got.join(' ') === tokens.map((t) => t.accepts[0]).join(' ') ||
    (got.length === tokens.length && got.every((w, i) => tokens[i].accepts.includes(w)))
  const positions = got.map((w, i) => tokens[i]?.accepts.includes(w) ?? false)
  return { correct, positions: correct ? got.map(() => true) : positions }
}

export function prepare(p: Problem) {
  return { tokens: p.tokens, cards: makeCards(p.tokens) }
}

/** ヒント: 各語の最初の文字だけ見せる（例: booking reference → b······ r········） */
export function hintFor(answer: string) {
  return answer.replace(/\S+/g, (w) => w[0] + '·'.repeat(w.length - 1))
}

import type { Drill, Problem, Token } from '../types'
import { normalize } from './problem'

const JAPANESE = /[぀-ヿ㐀-鿿！-｠]/
/** 語彙の見出しで「だれか・なにか」を表す語（文中では別の語に置き換わる） */
const PLACEHOLDER = /^(?:someone|somebody|something|sb|sth|one's|A|B|~|〜|～|…|\.\.\.)$/
const CIRCLED = '①②③④⑤⑥⑦⑧⑨'

interface Vocab {
  term: string
  /** 「stalling / stall」のように / で並べた書き方は、どれか 1 つが文中にあればよい */
  forms: string[]
  gloss: string
}

/** 「booking reference（予約番号・予約照会番号）」→ 語と日本語に分ける */
function parseVocab(line: string): Vocab | null {
  const i = line.search(/[（(]/)
  if (i <= 0) return null
  const term = line.slice(0, i).trim()
  const gloss = line
    .slice(i + 1)
    .trim()
    .replace(/[）)]$/, '')
    .trim()
  const forms = term
    .split('/')
    .map((f) => f.trim())
    .filter((f) => /[A-Za-z]/.test(f))
    .sort((a, b) => b.length - a.length)
  return forms.length && gloss ? { term, forms, gloss } : null
}

/**
 * ヒント用に語彙の意味を短くする。最初の「／」「。」まで、かっこ書きの補足は外す。
 * ただし先頭のかっこ（「（車が）エンストする」の「（車が）」）は意味の一部なので残す
 */
function shortGloss(gloss: string) {
  const first = gloss.split(/[／。]/)[0]
  const m = first.match(/^([（(][^）)]*[）)])?([^（(]*)/)
  return ((m?.[1] ?? '') + (m?.[2] ?? '')).trim() || gloss
}

const bare = (w: string) =>
  w
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '')

/** 語彙の語と文中の語が同じ語か（having ↔ have、developed ↔ develop などの活用を許す） */
function sameWord(term: string, word: string) {
  if (term === word) return true
  const base = term.length > 3 && term.endsWith('e') ? term.slice(0, -1) : term
  return base.length >= 3 && word.startsWith(base) && word.length - base.length <= 4
}

/** 文中で語彙が出てくる位置。見つかったら、続けて書かれている語のまとまり（[開始, 終了)）の一覧を返す */
function findTerm(words: string[], term: string, from: number): [number, number][] | null {
  const parts = term.split(/\s+/).map((p) => (PLACEHOLDER.test(p) ? null : bare(p)))
  const match = (wi: number, pi: number, runs: [number, number][]): [number, number][] | null => {
    if (pi === parts.length) return runs
    const part = parts[pi]
    if (part === null) {
      // 「someone」などは 1〜3 語に対応する
      for (let n = 1; n <= 3 && wi + n <= words.length; n++) {
        const r = match(wi + n, pi + 1, runs)
        if (r) return r
      }
      return null
    }
    if (wi >= words.length || !sameWord(part, bare(words[wi]))) return null
    const last = runs[runs.length - 1]
    const next: [number, number][] =
      last && last[1] === wi && parts[pi - 1] !== null ? [...runs.slice(0, -1), [last[0], wi + 1]] : [...runs, [wi, wi + 1]]
    return match(wi + 1, pi + 1, next)
  }
  for (let start = from; start < words.length; start++) {
    const r = match(start, 0, [])
    if (r) return r
  }
  return null
}

function sentenceTokens(en: string, vocab: Vocab[]): { tokens: Token[]; used: Vocab[] } {
  const words = en.split(/\s+/).filter(Boolean)
  const spans: { start: number; end: number; gloss: string }[] = []
  const used: Vocab[] = []
  const overlaps = (s: number, e: number) => spans.some((x) => s < x.end && x.start < e)
  for (const v of vocab) {
    let from = 0
    let found = false
    for (;;) {
      let runs: [number, number][] | null = null
      for (const form of v.forms) {
        const r = findTerm(words, form, from)
        if (r && (!runs || r[0][0] < runs[0][0])) runs = r
      }
      if (!runs) break
      if (!runs.some(([s, e]) => overlaps(s, e))) {
        // 日本語のヒントは、かっこ書きの補足を外した短い形にする
        const short = shortGloss(v.gloss)
        for (const [s, e] of runs) spans.push({ start: s, end: e, gloss: short })
        found = true
      }
      from = runs[runs.length - 1][1]
    }
    if (found) used.push(v)
  }

  // 同じヒントのカードが 2 枚以上あるときは ①② を付けて区別する
  const counts = new Map<string, number>()
  for (const s of spans) counts.set(s.gloss, (counts.get(s.gloss) ?? 0) + 1)
  const seen = new Map<string, number>()
  spans.sort((a, b) => a.start - b.start)
  for (const s of spans) {
    if ((counts.get(s.gloss) ?? 0) > 1) {
      const n = seen.get(s.gloss) ?? 0
      seen.set(s.gloss, n + 1)
      s.gloss = `${s.gloss}${CIRCLED[n] ?? n + 1}`
    }
  }

  const tokens: Token[] = []
  for (let i = 0; i < words.length; ) {
    const span = spans.find((s) => s.start === i)
    if (span) {
      const display = words.slice(span.start, span.end).join(' ')
      tokens.push({ display, accepts: [normalize(display)], gloss: span.gloss })
      i = span.end
    } else {
      tokens.push({ display: words[i], accepts: [normalize(words[i])] })
      i++
    }
  }
  return { tokens: attachArticles(tokens), used }
}

const ARTICLE = /^(?:a|an|the)$/i

/** 冠詞（a / an / the）は覚える対象にしないので、後ろの語とくっつけて 1 枚のカードにする */
function attachArticles(tokens: Token[]): Token[] {
  const out: Token[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const next = tokens[i + 1]
    if (t.gloss || !ARTICLE.test(t.display) || !next) {
      out.push(t)
    } else if (next.gloss) {
      // 入力式の語の前の冠詞は、入力欄の前に表示するだけ
      out.push({ ...next, prefix: t.display })
      i++
    } else {
      const display = `${t.display} ${next.display}`
      out.push({ display, accepts: [normalize(display)] })
      i++
    }
  }
  return out
}

/** ファイル名（2026-11-17 / 2026-11-17_2）から一覧に出す名前を作る */
function drillLabel(name: string) {
  const m = name.match(/(\d{4})-(\d{2})-(\d{2})(?:_(\d+))?/)
  if (!m) return name
  return `${Number(m[2])}/${Number(m[3])}${m[4] ? ` (${m[4]})` : ''} のドリル`
}

/**
 * センテンスリピートドリルの MD を問題にする。
 * - 「* 語（日本語）」の行が復習語彙。文中のその語を入力式にする
 * - 和訳は次のどちらか。和訳のない文は問題にしない
 *   - 別のセクションに「1. 日本語」と同じ番号で書く
 *   - 「1. 英文」のすぐ次の行に書く
 */
export function parseDrill(name: string, md: string): Drill {
  const lines = md.replace(/^﻿/, '').split(/\r?\n/)
  const vocab: Vocab[] = []
  const sentences: { n: number; en: string; ja?: string }[] = []
  const jaByNumber = new Map<number, string>()
  let afterEnglish = false
  for (const raw of lines) {
    // 全角数字（１．）も番号として読む
    const line = raw.trim().replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    if (!line) continue
    const wasAfterEnglish = afterEnglish
    afterEnglish = false
    if (line.startsWith('#')) continue // 見出し
    const item = line.match(/^[*\-•]\s+(.+)$/)
    if (item) {
      const v = parseVocab(item[1])
      if (v) vocab.push(v)
      continue
    }
    const numbered = line.match(/^(\d+)[.)．、]\s*(.+)$/)
    if (numbered) {
      const n = Number(numbered[1])
      const text = numbered[2].trim()
      if (JAPANESE.test(text)) jaByNumber.set(n, text)
      else {
        sentences.push({ n, en: text })
        afterEnglish = true
      }
      continue
    }
    const last = sentences[sentences.length - 1]
    if (wasAfterEnglish && JAPANESE.test(line)) {
      last.ja = line.replace(/^(?:訳|和訳)\s*[:：]\s*/, '')
    }
  }
  for (const s of sentences) s.ja = jaByNumber.get(s.n) ?? s.ja

  const label = drillLabel(name)
  // 長い語彙から先に当てる（hard water と water のような重なりを長いほうに）
  const byLength = [...vocab].sort((a, b) => b.term.length - a.term.length)
  const problems: Problem[] = sentences
    .filter((s) => s.ja)
    .map((s) => {
      const { tokens, used } = sentenceTokens(s.en, byLength)
      return {
        id: `${name}-${s.n}`,
        tag: label,
        ja: s.ja!,
        tokens,
        note: used.map((v) => `${v.term}：${v.gloss}`).join('\n'),
      }
    })
  return { name, label, problems, sentences: sentences.length }
}

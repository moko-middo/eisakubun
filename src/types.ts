/** 1 問（ドリルの英文 1 文から作る） */
export interface Problem {
  id: string
  /** ドリルの名前（例: 11/17 のドリル） */
  tag: string
  ja: string
  /** 模範解答を語（または入力式のかたまり）に分けたもの */
  tokens: Token[]
  /** 解説（使った復習語彙） */
  note: string
}

/** content/drills/ の MD 1 つ分 */
export interface Drill {
  name: string
  label: string
  problems: Problem[]
  /** MD にあった英文の数（和訳のない文も含む） */
  sentences: number
}

/** 答えの 1 語（または入力式の語のかたまり） */
export interface Token {
  /** 表示用（句読点付き） */
  display: string
  /** 採点で受け付ける綴り（小文字） */
  accepts: string[]
  /** 入力式なら日本語のヒント */
  gloss?: string
  /** 入力式の前に付いている冠詞（a / an / the）。入力欄の前に表示し、入力はしなくてよい */
  prefix?: string
}

/** 並べ替えの選択肢カード */
export interface Card {
  id: number
  /** 並べ替えカードなら英語、入力式なら日本語のヒント */
  label: string
  typed: boolean
  /** 入力式の前に付いている冠詞 */
  prefix?: string
}

/** 並べたカード 1 枚（入力式なら入力した文字と、そのカードの日本語のヒント） */
export interface Placed {
  text: string
  gloss?: string
}

export interface AnswerLog {
  problemId: string
  correct: boolean
  at: string
  /** 自分の答え（間違いの分析に使う） */
  placed?: Placed[]
}

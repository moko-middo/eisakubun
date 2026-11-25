import { STORAGE_SYNCED } from '../hooks/useLocalStorage'

/**
 * GitHub の非公開リポジトリ（moko-middo/eisakubun-data）の sync.json に記録を保存し、複数の端末で同じ記録を使う。
 *
 * - トークンはこの端末の localStorage（eisakubun.sync）にだけ置く。同期のファイルには入れない
 * - 合わせ方は「前回の同期のときの内容」を基準にした 3 方向マージ
 *   - 記録・お金の出入り・ごほうび（一覧）: 両方で増えたものは両方残し、どちらかで消したものは消す
 *   - 設定など（1 つの値）: この端末で変えていればこの端末の値、変えていなければ GitHub の値
 *   - 連続正解の自己ベスト: 大きいほう
 */

export const SYNC_REPO = { owner: 'moko-middo', repo: 'eisakubun-data', path: 'sync.json' }
const CONFIG_KEY = 'eisakubun.sync'
const BASE_KEY = 'eisakubun.sync.base'

/** 同期するもの。どこまで解いたか・効果音は端末ごと */
const LISTS: Record<string, (x: Record<string, unknown>) => string> = {
  'sakubun.drill.logs': (x) => `${x.problemId}|${x.at}`,
  'sakubun.wallet': (x) => String(x.id),
  'sakubun.rewards': (x) => String(x.id),
  'sakubun.snapshots': (x) => String(x.id),
  'sakubun.drillMeta': (x) => String(x.name),
}
const VALUES = ['sakubun.goal', 'sakubun.progos']
const MAXES = ['sakubun.bestCombo']
const KEYS = [...Object.keys(LISTS), ...VALUES, ...MAXES]

type Data = Record<string, unknown>

export interface SyncConfig {
  token: string
  lastSyncedAt?: string
  error?: string
}

export function loadConfig(): SyncConfig | null {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null')
  } catch {
    return null
  }
}

export function saveConfig(config: SyncConfig | null) {
  if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  else {
    localStorage.removeItem(CONFIG_KEY)
    localStorage.removeItem(BASE_KEY)
  }
}

// ── 合わせ方 ──────────────────────────────────

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function mergeList(local: unknown, remote: unknown, base: unknown, id: (x: Record<string, unknown>) => string) {
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])
  const l = arr(local)
  const r = arr(remote)
  const baseIds = new Set(arr(base).map(id))
  const localIds = new Set(l.map(id))
  const remoteIds = new Set(r.map(id))
  const out = new Map<string, Record<string, unknown>>()
  for (const x of [...r, ...l]) {
    const k = id(x)
    // 前回の同期のときにあって、どちらかで消えたものは消したとみなす
    if (baseIds.has(k) && (!localIds.has(k) || !remoteIds.has(k))) continue
    out.set(k, x)
  }
  const list = [...out.values()]
  // 記録とお金の出入りは時刻順に並べる
  if (list.every((x) => typeof x.at === 'string')) list.sort((a, b) => String(a.at).localeCompare(String(b.at)))
  return list
}

export function merge(local: Data, remote: Data, base: Data): Data {
  const out: Data = {}
  for (const [key, id] of Object.entries(LISTS)) out[key] = mergeList(local[key], remote[key], base[key], id)
  for (const key of VALUES) {
    // その端末ではじめて同期するとき（基準がない）は、最初から入っている値より GitHub の値を使う
    const changedHere = base[key] !== undefined && !same(local[key], base[key])
    out[key] = changedHere || remote[key] === undefined ? local[key] : remote[key]
  }
  for (const key of MAXES) out[key] = Math.max(Number(local[key] ?? 0), Number(remote[key] ?? 0))
  for (const key of KEYS) if (out[key] === undefined) delete out[key]
  return out
}

// ── GitHub とのやりとり ──────────────────────────

const url = () => `https://api.github.com/repos/${SYNC_REPO.owner}/${SYNC_REPO.repo}/contents/${SYNC_REPO.path}`
const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
})

const toBase64 = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(bin)
}
const fromBase64 = (b64: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)))

class SyncError extends Error {}

function explain(status: number) {
  if (status === 401) return '鍵（トークン）が正しくないか、期限が切れています'
  if (status === 403) return '鍵に書き込みの権限がありません（Contents: Read and write にしてください）'
  if (status === 404) return 'リポジトリ eisakubun-data が見つかりません（鍵で選んだリポジトリを確認してください）'
  return `GitHub との通信に失敗しました（${status}）`
}

async function fetchRemote(token: string): Promise<{ data: Data; sha?: string }> {
  const res = await fetch(url(), { headers: headers(token), cache: 'no-store' })
  if (res.status === 404) {
    // ファイルがまだない（はじめての同期）か、リポジトリが見えないかを区別する
    const repo = await fetch(`https://api.github.com/repos/${SYNC_REPO.owner}/${SYNC_REPO.repo}`, { headers: headers(token) })
    if (!repo.ok) throw new SyncError(explain(repo.status))
    return { data: {} }
  }
  if (!res.ok) throw new SyncError(explain(res.status))
  const body = await res.json()
  return { data: JSON.parse(fromBase64(body.content)).data ?? {}, sha: body.sha }
}

async function pushRemote(token: string, data: Data, sha?: string) {
  const content = toBase64(JSON.stringify({ app: 'eisakubun', version: 1, savedAt: new Date().toISOString(), data }, null, 1))
  const res = await fetch(url(), {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ message: `sync ${new Date().toISOString()}`, content, ...(sha ? { sha } : {}) }),
  })
  if (res.status === 409 || res.status === 422) return false // ほかの端末が先に書いた
  if (!res.ok) throw new SyncError(explain(res.status))
  return true
}

const readLocal = (): Data => {
  const d: Data = {}
  for (const key of KEYS) {
    const v = localStorage.getItem(key)
    if (v !== null) d[key] = JSON.parse(v)
  }
  return d
}

let running: Promise<void> | null = null

/**
 * GitHub と同期する。GitHub の内容を読み、手元と合わせて、変わったところを両方に書く。
 * 同時に呼ばれたら 1 回にまとめる。結果は設定（lastSyncedAt / error）に残す
 */
export function syncNow(): Promise<void> {
  running ??= (async () => {
    const config = loadConfig()
    if (!config) return
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const remote = await fetchRemote(config.token)
        const local = readLocal()
        const base: Data = JSON.parse(localStorage.getItem(BASE_KEY) ?? '{}')
        const merged = merge(local, remote.data, base)
        if (!same(merged, local)) {
          for (const [k, v] of Object.entries(merged)) localStorage.setItem(k, JSON.stringify(v))
          window.dispatchEvent(new Event(STORAGE_SYNCED))
        }
        if (!same(merged, remote.data) && !(await pushRemote(config.token, merged, remote.sha))) continue
        localStorage.setItem(BASE_KEY, JSON.stringify(merged))
        saveConfig({ token: config.token, lastSyncedAt: new Date().toISOString() })
        return
      }
      throw new SyncError('ほかの端末と同時に保存したため、同期できませんでした。もう一度お試しください')
    } catch (e) {
      const message = e instanceof SyncError ? e.message : '通信できませんでした（電波のよいところで自動でやり直します）'
      saveConfig({ ...config, error: message })
    } finally {
      window.dispatchEvent(new Event(SYNC_CHANGED))
    }
  })().finally(() => {
    running = null
  })
  return running
}

/** 同期の状態（最後に同期した時刻・エラー）が変わったときのイベント */
export const SYNC_CHANGED = 'sakubun-sync-changed'

let timer: number | undefined
/** 少し待ってから同期する（続けて解いているあいだは 1 回にまとめる） */
export function scheduleSync(ms = 10_000) {
  if (!loadConfig()) return
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void syncNow(), ms)
}

import { localDate } from './habit'

/**
 * 記録のバックアップ。このアプリが localStorage に保存しているもの（sakubun. で始まるもの）をまとめて
 * 1 つの JSON ファイルにし、あとでそのファイルから戻せるようにする。
 */
const PREFIX = 'sakubun.'
const APP = 'eisakubun'
export const LAST_BACKUP_KEY = 'sakubun.lastBackup'

interface BackupFile {
  app: typeof APP
  version: 1
  savedAt: string
  data: Record<string, unknown>
}

function collect(): BackupFile {
  const data: Record<string, unknown> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!
    if (!key.startsWith(PREFIX)) continue
    try {
      data[key] = JSON.parse(localStorage.getItem(key)!)
    } catch {
      data[key] = localStorage.getItem(key)
    }
  }
  return { app: APP, version: 1, savedAt: new Date().toISOString(), data }
}

/**
 * バックアップを保存する。スマホで「共有」が使えるときは送り先（Google ドライブなど）を選べ、
 * 使えないときはダウンロードする。保存できたら true（共有をキャンセルしたら false）
 */
export async function saveBackup(): Promise<boolean> {
  const today = localDate(new Date())
  const name = `eisakubun-backup-${today}.json`
  const backup = collect()
  // 戻したときに「今日は保存済み」になるよう、保存した日もファイルに入れておく
  backup.data[LAST_BACKUP_KEY] = today
  const json = JSON.stringify(backup, null, 1)
  const file = new File([json], name, { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '英作文ドリルのバックアップ' })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false
      download(json, name)
    }
  } else {
    download(json, name)
  }
  localStorage.setItem(LAST_BACKUP_KEY, JSON.stringify(today))
  return true
}

function download(json: string, name: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** バックアップのファイルの中身を確かめる。戻す前の確認用に、保存した日時と記録の数を返す */
export async function readBackup(file: File): Promise<{ backup: BackupFile; savedAt: string; answers: number }> {
  let backup: BackupFile
  try {
    backup = JSON.parse(await file.text())
  } catch {
    throw new Error('ファイルを読み込めませんでした')
  }
  if (backup?.app !== APP || typeof backup.data !== 'object') throw new Error('英作文ドリルのバックアップではありません')
  const logs = backup.data['sakubun.drill.logs']
  return { backup, savedAt: backup.savedAt, answers: Array.isArray(logs) ? logs.length : 0 }
}

/** バックアップの内容で今の記録を置き換える（このあとページを読み込み直す） */
export function restoreBackup(backup: BackupFile) {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)!
    if (key.startsWith(PREFIX)) localStorage.removeItem(key)
  }
  for (const [key, value] of Object.entries(backup.data)) {
    if (key.startsWith(PREFIX)) localStorage.setItem(key, JSON.stringify(value))
  }
}

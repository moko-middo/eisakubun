import { useRef, useState } from 'react'
import { readBackup, restoreBackup, saveBackup } from '../lib/backup'

/** 記録タブのバックアップ欄 */
export function Backup({ lastBackup, onSaved }: { lastBackup: string | null; onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')

  const save = async () => {
    if (await saveBackup()) {
      setMessage('保存しました。')
      onSaved()
    }
  }

  const restore = async (file: File) => {
    try {
      const { backup, savedAt, answers } = await readBackup(file)
      const when = new Date(savedAt).toLocaleString('ja-JP')
      if (!confirm(`${when} のバックアップ（解いた記録 ${answers} 問）で、今の記録を置き換えますか？\n今の記録は消えます。`)) return
      restoreBackup(backup)
      location.reload()
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  return (
    <div className="backup">
      <h3 className="section-title">バックアップ</h3>
      <p className="muted small">
        記録はこのブラウザの中だけに保存されています。ブラウザのデータを消したり機種変更したりする前に、ファイルに保存しておきましょう。
        {lastBackup ? `（最後に保存: ${lastBackup.slice(5).replace('-', '/')}）` : '（まだ保存していません）'}
      </p>
      <div className="actions backup-actions">
        <button className="sub-btn" onClick={() => fileRef.current?.click()}>
          バックアップから戻す
        </button>
        <button className="primary-btn" onClick={save}>
          バックアップを保存
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void restore(f)
          e.target.value = ''
        }}
      />
      {message && <p className="small backup-message">{message}</p>}
    </div>
  )
}

/** その日最初に開いたときに出す、ワンタップのバックアップのお知らせ */
export function BackupBanner({ onSaved, onLater }: { onSaved: () => void; onLater: () => void }) {
  return (
    <div className="backup-banner">
      <span>📦 今日のバックアップを保存しますか？</span>
      <div>
        <button className="link-btn small" onClick={onLater}>
          あとで
        </button>
        <button
          className="primary-btn"
          onClick={async () => {
            if (await saveBackup()) onSaved()
          }}
        >
          保存
        </button>
      </div>
    </div>
  )
}

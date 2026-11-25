import { useEffect, useState } from 'react'
import { loadConfig, saveConfig, SYNC_CHANGED, SYNC_REPO, syncNow, type SyncConfig } from '../lib/sync'

/** 最後の同期の設定と状態を読み、変わったら読み直す */
export function useSyncConfig() {
  const [config, setConfig] = useState<SyncConfig | null>(loadConfig)
  useEffect(() => {
    const reload = () => setConfig(loadConfig())
    window.addEventListener(SYNC_CHANGED, reload)
    return () => window.removeEventListener(SYNC_CHANGED, reload)
  }, [])
  return config
}

const time = (iso: string) => new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** 記録タブの「GitHub と同期」欄 */
export function SyncSettings() {
  const config = useSyncConfig()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    await syncNow()
    setBusy(false)
  }

  const connect = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim()) return
    saveConfig({ token: token.trim() })
    setToken('')
    await run()
  }

  if (!config) {
    return (
      <div className="sync">
        <h3 className="section-title">GitHub と同期</h3>
        <p className="muted small">
          記録を GitHub の非公開リポジトリ（{SYNC_REPO.owner}/{SYNC_REPO.repo}）に自動で保存し、ほかのスマホやパソコンでも同じ記録で続けられます。
        </p>
        <ol className="sync-steps small">
          <li>
            <a href={`https://github.com/new?name=${SYNC_REPO.repo}&visibility=private`} target="_blank" rel="noreferrer">
              非公開リポジトリ {SYNC_REPO.repo} を作る
            </a>
            （Private を選ぶ）
          </li>
          <li>
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
              鍵（Fine-grained token）を作る
            </a>
            ：Repository access は「Only select repositories」で {SYNC_REPO.repo} だけ、Permissions の Contents を「Read and write」にする
          </li>
          <li>できた鍵（github_pat_ で始まる文字）を下に貼り付けて「同期を始める」</li>
        </ol>
        <form className="sync-form" onSubmit={connect}>
          <input
            type="password"
            placeholder="github_pat_..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            aria-label="GitHub の鍵"
          />
          <button className="primary-btn" type="submit" disabled={!token.trim() || busy}>
            同期を始める
          </button>
        </form>
        <p className="muted small">鍵はこのブラウザの中だけに保存され、同期のファイルやバックアップには入りません。</p>
      </div>
    )
  }

  return (
    <div className="sync">
      <h3 className="section-title">GitHub と同期</h3>
      {config.error ? (
        <p className="sync-status ng">⚠️ {config.error}</p>
      ) : (
        <p className="sync-status ok">
          ☁️ 同期しています{config.lastSyncedAt && `（最後の同期: ${time(config.lastSyncedAt)}）`}
        </p>
      )}
      <p className="muted small">
        開いたとき・解いて少したったとき・アプリを閉じたときに、{SYNC_REPO.owner}/{SYNC_REPO.repo} と自動で同期します。
      </p>
      <div className="actions backup-actions">
        <button
          className="sub-btn"
          onClick={() => confirm('この端末の同期をやめますか？（記録は消えません）') && (saveConfig(null), window.dispatchEvent(new Event(SYNC_CHANGED)))}
        >
          同期をやめる
        </button>
        <button className="primary-btn" onClick={run} disabled={busy}>
          {busy ? '同期中…' : '今すぐ同期'}
        </button>
      </div>
    </div>
  )
}

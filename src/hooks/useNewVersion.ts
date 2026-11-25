import { useEffect, useState } from 'react'

/** 新しいドリルやアプリの更新が公開されたか、確かめる間隔 */
const CHECK_EVERY = 30 * 60 * 1000

/** 今のページが読み込んでいる JS のファイル名（ビルドごとに変わる） */
const scriptOf = (html: string) => html.match(/assets\/index-[\w-]+\.js/)?.[0]
const current = () => scriptOf(document.documentElement.outerHTML)

/**
 * 開いたままのアプリに、新しい版（新しいドリル）が公開されたかどうか。
 * アプリに戻ってきたときと、30 分ごとに確かめる
 */
export function useNewVersion() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!import.meta.env.PROD) return
    const check = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}?check=${Date.now()}`, { cache: 'no-store' })
        const latest = scriptOf(await res.text())
        if (latest && current() && latest !== current()) setReady(true)
      } catch {
        // 電波がないときは何もしない
      }
    }
    void check()
    const timer = window.setInterval(check, CHECK_EVERY)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return ready
}

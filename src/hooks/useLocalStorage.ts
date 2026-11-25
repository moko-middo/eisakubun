import { useEffect, useState } from 'react'

/** GitHub との同期などで localStorage を書き換えたあとに送るイベント。受け取ると値を読み直す */
export const STORAGE_SYNCED = 'sakubun-storage-synced'

function read<T>(key: string, initial: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored ? (JSON.parse(stored) as T) : initial
  } catch {
    return initial
  }
}

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => read(key, initial))

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // 保存できない環境（プライベートモード等）ではメモリ上のみで動かす
    }
  }, [key, value])

  useEffect(() => {
    const reload = () => setValue(read(key, initial))
    window.addEventListener(STORAGE_SYNCED, reload)
    return () => window.removeEventListener(STORAGE_SYNCED, reload)
    // initial は呼び出しごとに新しい値になりうるので、key だけで登録し直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return [value, setValue] as const
}

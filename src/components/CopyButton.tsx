import { useState } from 'react'

/** 文章をコピーするボタン。コピーできない環境では、文章を表示して手でコピーしてもらう */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('manual')
    }
  }

  return (
    <div className="copy">
      <button className="sub-btn copy-btn" onClick={copy}>
        {label}
      </button>
      {state === 'copied' && <p className="muted small">コピーしました。Gemini や Claude のアプリに貼り付けて送ってください。</p>}
      {state === 'manual' && (
        <>
          <p className="muted small">自動でコピーできなかったので、下の文章を長押しでコピーしてください。</p>
          <textarea className="copy-text" readOnly value={text} rows={8} onFocus={(e) => e.currentTarget.select()} />
        </>
      )}
    </div>
  )
}

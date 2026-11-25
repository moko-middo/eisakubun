const COLORS = ['#2f6f5e', '#ffe27a', '#e0a066', '#6fbfa6', '#ef7a66', '#7a4fb0']

/** 今日の目標を達成したときの紙吹雪 */
export function Confetti({ streak, earned }: { streak: number; earned: number }) {
  const pieces = Array.from({ length: 70 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    duration: 1.8 + Math.random() * 1.4,
    color: COLORS[i % COLORS.length],
    rotate: Math.random() * 360,
  }))
  return (
    <div className="confetti" aria-live="polite">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
      <div className="goal-toast">
        🎉 今日の目標達成！
        <br />
        <span>🔥 {streak}日連続</span>
        <br />
        <span className="earned">💰 今日 +{earned.toLocaleString('ja-JP')}円</span>
      </div>
    </div>
  )
}

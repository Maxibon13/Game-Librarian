import React, { useEffect, useMemo, useState } from 'react'
import type { Game } from './App'

type Props = {
  game: Game
  startedAt: number
  onForceQuit: () => void
}

export function SessionOverlay({ game, startedAt, onForceQuit }: Props) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const elapsedMs = now - startedAt
  const elapsed = formatElapsed(elapsedMs)

  const bg = useMemo(() => {
    const uri = (game as any).image as string | undefined
    if (uri) return `url(${uri})`
    if (game.launcher === 'steam' && /^\d+$/.test(String(game.id))) {
      return `url(https://steamcdn-a.akamaihd.net/steam/apps/${game.id}/library_600x900.jpg)`
    }
    return 'linear-gradient(135deg, #2a2d35, #1f2127)'
  }, [game])

  return (
    <div className="session-overlay">
      <div className="session-bg" style={{ backgroundImage: bg }} />
      <div className="session-content">
        <div className="session-title">{game.title}</div>
        <div className="session-elapsed">{elapsed}</div>
        <div className="session-actions">
          <button className="launch" onClick={onForceQuit}>Force Quit</button>
        </div>
      </div>
    </div>
  )
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const hh = hours.toString().padStart(2, '0')
  const mm = minutes.toString().padStart(2, '0')
  const ss = seconds.toString().padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}



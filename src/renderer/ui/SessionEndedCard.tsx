import React, { useMemo, useState } from 'react'
import type { Game } from './App'

type Props = {
  game: Game
  durationMs: number
  onClose: () => void
}

export function SessionEndedCard({ game, durationMs, onClose }: Props) {
  const [hiding, setHiding] = useState(false)

  const image = useMemo(() => {
    const uri = (game as any).image as string | undefined
    if (uri) return uri
    if (game.launcher === 'steam' && /^\d+$/.test(String(game.id))) {
      return `https://steamcdn-a.akamaihd.net/steam/apps/${game.id}/library_600x900.jpg`
    }
    return ''
  }, [game])

  const elapsed = formatElapsed(durationMs)

  function handleClose() {
    setHiding(true)
    setTimeout(onClose, 220)
  }

  return (
    <div className={`ended-overlay ${hiding ? 'hide' : ''}`} onClick={handleClose}>
      <div className={`ended-card ${hiding ? 'hide' : ''}`} role="dialog" aria-label="Session ended">
        <div className="ended-title">{game.title}</div>
        {image ? (
          <img className="ended-thumb" src={image} alt="Game artwork" />
        ) : (
          <div className="ended-thumb placeholder" />
        )}
        <div className="ended-elapsed">Session time: {elapsed}</div>
        <div className="ended-hint">Click to dismiss</div>
      </div>
    </div>
  )
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const hh = hours.toString().padStart(2, '0')
  const mm = minutes.toString().padStart(2, '0')
  const ss = seconds.toString().padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}



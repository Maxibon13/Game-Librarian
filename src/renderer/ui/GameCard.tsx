import React, { useState } from 'react'
import type { Game } from './App'
import hoverSound from '../../sounds/hover.ogg'

type Props = {
  game: Game
  onLaunch: () => void
}

export function GameCard({ game, onLaunch }: Props) {
  const [hover, setHover] = useState(false)
  const [audioPlayed, setAudioPlayed] = useState(false)

  const handleMouseEnter = () => {
    setHover(true)
    if (!audioPlayed) {
      const audio = new Audio(hoverSound)
      audio.volume = 0.6
      audio.play().catch(() => {})
      setAudioPlayed(true)
    }
  }

  const handleMouseLeave = () => {
    setHover(false)
    // Reset audio flag after a short delay to allow re-triggering
    setTimeout(() => setAudioPlayed(false), 100)
  }

  return (
    <div
      className={`card ${hover ? 'hover' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="thumb"
        aria-hidden
        style={{
          backgroundImage: gameThumb(game),
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: '#2a2d35'
        }}
      />
      <div className="title">{game.title}</div>
      {hover && (
        <div className="overlay">
          <div className="meta">
            <span>Launcher: {game.launcher}</span>
            <span>Playtime: {formatMinutes(game.playtimeMinutes ?? 0)}</span>
          </div>
          <button className="launch" onClick={onLaunch}>
            Launch
          </button>
        </div>
      )}
    </div>
  )
}

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function gameThumb(game: Game) {
  const uri = (game as any).image as string | undefined
  if (uri) return `url(${uri})`
  if (game.launcher === 'steam' && /^\d+$/.test(String(game.id))) {
    const id = String(game.id)
    return `url(https://steamcdn-a.akamaihd.net/steam/apps/${id}/library_600x900.jpg)`
  }
  return 'linear-gradient(135deg, #2a2d35, #1f2127)'
}



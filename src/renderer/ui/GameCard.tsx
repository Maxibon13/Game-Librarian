import React, { useState } from 'react'
import type { Game } from './App'
import hoverSound from '../../sounds/hover.ogg'

type Props = {
  game: Game
  onLaunch: () => void
  variant?: 'large' | 'small' | 'list'
  onOpen?: () => void
  audioEnabled?: boolean
  masterVolume?: number
  audioProfile?: 'normal' | 'alt'
}

export function GameCard({ game, onLaunch, onOpen, variant = 'large', audioEnabled = true, masterVolume = 1, audioProfile = 'normal' }: Props) {
  const [hover, setHover] = useState(false)
  const [audioPlayed, setAudioPlayed] = useState(false)

  const handleMouseEnter = () => {
    setHover(true)
    if (!audioPlayed && audioEnabled) {
      const src = audioProfile === 'alt'
        ? new URL('../../sounds/hover_alt.ogg', import.meta.url).href
        : hoverSound
      const audio = new Audio(src)
      const vol = Math.max(0, Math.min(1, masterVolume))
      audio.volume = 0.6 * vol
      audio.play().catch(() => {})
      setAudioPlayed(true)
    }
  }

  const handleMouseLeave = () => {
    setHover(false)
    // Reset audio flag after a short delay to allow re-triggering
    setTimeout(() => setAudioPlayed(false), 100)
  }

  const thumbStyle: React.CSSProperties = {
    backgroundImage: gameThumb(game),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundColor: '#2a2d35'
  }

  const metaInline = (
    <div className="meta-inline">
      <span className="tag launcher">{game.launcher}</span>
      <span className="tag time">{formatMinutes(game.playtimeMinutes ?? 0)}</span>
    </div>
  )

  const handleOpen = () => { onOpen?.() }

  if (variant === 'list') {
    return (
      <div className={`card list ${hover ? 'hover' : ''}`} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} onClick={handleOpen}>
        <div className="thumb" aria-hidden style={thumbStyle} />
        <div className="content">
          <div className="title-row">
            <div className="title">{game.title}</div>
            {metaInline}
          </div>
        </div>
        <button className="launch" onClick={(e) => { e.stopPropagation(); onLaunch() }}>Launch</button>
      </div>
    )
  }

  return (
    <div className={`card ${variant} ${hover ? 'hover' : ''}`} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} onClick={handleOpen}>
      <div className="thumb" aria-hidden style={thumbStyle} />
      <div className="title-row"><div className="title">{game.title}</div>{metaInline}</div>
      {hover && (
        <div className="overlay">
          <button className="launch" onClick={(e) => { e.stopPropagation(); onLaunch() }}>Launch</button>
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



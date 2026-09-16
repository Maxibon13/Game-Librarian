import React from 'react'
import type { Game } from '../lib/types'
import { gameKey, launcherLabel } from '../lib/types'
import { formatMinutes, formatRelative } from '../lib/format'
import { playSound } from '../lib/audio'
import { Cover } from './Cover'
import { IconPlay } from './Icons'

type Props = {
  game: Game
  variant?: 'portrait' | 'compact' | 'list'
  onPlay: (g: Game) => void
  onOpen: (g: Game) => void
  playing?: boolean
  isDefault?: boolean
  style?: React.CSSProperties
}

// Tiles are the primary console affordance:
//   click / X / Space  -> details      Enter / A -> Play
export const GameTile = React.memo(function GameTile({ game, variant = 'portrait', onPlay, onOpen, playing, isDefault, style }: Props) {
  const key = gameKey(game)
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onPlay(game) }
    else if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); onOpen(game) }
  }
  const common = {
    role: 'button',
    tabIndex: 0,
    'data-nav': true,
    'data-game-key': key,
    ...(isDefault ? { 'data-nav-default': true } : {}),
    onClick: () => onOpen(game),
    onKeyDown,
    onFocus: () => playSound('hover'),
    onMouseEnter: () => playSound('hover'),
    'aria-label': `${game.title}, ${launcherLabel(game.launcher)}, ${formatMinutes(game.playtimeMinutes ?? 0)} played`
  } as const

  if (variant === 'list') {
    return (
      <div className={`tile tile-list ${playing ? 'is-playing' : ''}`} style={style} {...common}>
        <Cover game={game} className="tile-list-cover" />
        <div className="tile-list-body">
          <div className="tile-title">{game.title}</div>
          <div className="tile-sub">{launcherLabel(game.launcher)} · {formatRelative(game.lastPlayedAt)}</div>
        </div>
        <div className="tile-list-time">{formatMinutes(game.playtimeMinutes ?? 0)}</div>
        <button className="btn btn-accent btn-sm tile-list-play" tabIndex={-1} onClick={(e) => { e.stopPropagation(); onPlay(game) }} aria-label={`Play ${game.title}`}>
          <IconPlay size={14} /> Play
        </button>
      </div>
    )
  }

  return (
    <div className={`tile tile-${variant} ${playing ? 'is-playing' : ''}`} style={style} {...common}>
      <Cover game={game} />
      <div className="tile-shade" />
      <div className="tile-caption">
        <div className="tile-title">{game.title}</div>
        <div className="tile-sub">
          <span className="chip chip-launcher">{launcherLabel(game.launcher)}</span>
          <span>{formatMinutes(game.playtimeMinutes ?? 0)}</span>
        </div>
      </div>
      {playing && <div className="tile-playing-badge">Playing</div>}
      <button
        className="tile-play"
        tabIndex={-1}
        onClick={(e) => { e.stopPropagation(); onPlay(game) }}
        aria-label={`Play ${game.title}`}
      >
        <IconPlay size={18} />
      </button>
    </div>
  )
})

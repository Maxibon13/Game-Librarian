import React from 'react'
import type { Game } from '../lib/types'
import { formatElapsed } from '../lib/format'
import { Cover } from '../components/Cover'
import { IconStop } from '../components/Icons'

type Props = {
  game: Game
  startedAt: number
  onForceQuit: () => void
  onMinimize: () => void
}

// Optional full-screen "focus mode" while a game is running.
export function SessionOverlay({ game, startedAt, onForceQuit, onMinimize }: Props) {
  const [now, setNow] = React.useState(Date.now())
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="session-overlay" data-nav-root>
      <div className="session-bg"><Cover game={game} kind="hero" eager /></div>
      <div className="session-card">
        <Cover game={game} className="session-cover" eager />
        <div className="session-kicker"><span className="live-dot" /> Now playing</div>
        <div className="session-title">{game.title}</div>
        <div className="session-elapsed">{formatElapsed(now - startedAt)}</div>
        <div className="session-actions">
          <button className="btn btn-ghost" data-nav data-nav-default onClick={onMinimize}>Back to library</button>
          <button className="btn btn-danger" data-nav onClick={onForceQuit}><IconStop size={16} /> Force quit</button>
        </div>
      </div>
    </div>
  )
}

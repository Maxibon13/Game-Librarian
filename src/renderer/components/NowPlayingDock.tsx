import React from 'react'
import type { Session } from '../lib/types'
import { formatElapsed } from '../lib/format'
import { Cover } from './Cover'
import { IconStop, IconFullscreen } from './Icons'

type Props = {
  session: Session
  onForceQuit: () => void
  onOpen: () => void
  onFocusMode: () => void
}

// Compact "now playing" pill. The full-screen session overlay is opt-in (focus mode).
export function NowPlayingDock({ session, onForceQuit, onOpen, onFocusMode }: Props) {
  const [now, setNow] = React.useState(Date.now())
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="now-playing" role="status" aria-live="polite">
      <button className="now-playing-main" onClick={onOpen} data-nav aria-label={`Now playing ${session.game.title}`}>
        <Cover game={session.game} className="now-playing-cover" eager />
        <div className="now-playing-text">
          <div className="now-playing-label"><span className="live-dot" /> Now playing</div>
          <div className="now-playing-title">{session.game.title}</div>
          <div className="now-playing-time">{formatElapsed(now - session.startedAt)}</div>
        </div>
      </button>
      <div className="now-playing-actions">
        <button className="icon-btn" title="Focus mode" onClick={onFocusMode} data-nav><IconFullscreen size={16} /></button>
        <button className="icon-btn danger" title="Force quit" onClick={onForceQuit} data-nav><IconStop size={16} /></button>
      </div>
    </div>
  )
}

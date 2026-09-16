import React from 'react'
import type { Game } from '../lib/types'
import { gameKey } from '../lib/types'
import { GameTile } from './GameTile'
import { IconChevronLeft, IconChevronRight } from './Icons'

type Props = {
  title: string
  games: Game[]
  onPlay: (g: Game) => void
  onOpen: (g: Game) => void
  playingKey?: string | null
  action?: { label: string; onClick: () => void }
  firstIsDefault?: boolean
}

// Horizontal cover rail (Xbox Home). Rails are short; no virtualization needed.
export function Rail({ title, games, onPlay, onOpen, playingKey, action, firstIsDefault }: Props) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  if (games.length === 0) return null
  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' })
  }
  return (
    <section className="rail" aria-label={title}>
      <header className="rail-head">
        <h2>{title}</h2>
        <div className="rail-tools">
          {action && <button className="btn btn-ghost btn-sm" data-nav onClick={action.onClick}>{action.label}</button>}
          <button className="icon-btn" tabIndex={-1} aria-label="Scroll left" onClick={() => scrollBy(-1)}><IconChevronLeft size={18} /></button>
          <button className="icon-btn" tabIndex={-1} aria-label="Scroll right" onClick={() => scrollBy(1)}><IconChevronRight size={18} /></button>
        </div>
      </header>
      <div className="rail-scroller" ref={ref}>
        {games.map((g, i) => (
          <GameTile
            key={gameKey(g)}
            game={g}
            variant="portrait"
            onPlay={onPlay}
            onOpen={onOpen}
            playing={playingKey === gameKey(g)}
            isDefault={firstIsDefault && i === 0}
          />
        ))}
      </div>
    </section>
  )
}

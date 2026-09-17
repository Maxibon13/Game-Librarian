import React from 'react'
import type { Game } from '../lib/types'
import { gameKey, launcherLabel } from '../lib/types'
import { formatMinutes, formatRelative } from '../lib/format'
import { Cover } from '../components/Cover'
import { Rail } from '../components/Rail'
import { EmptyState } from '../components/EmptyState'
import { IconPlay, IconInfo, IconLibrary } from '../components/Icons'

type Props = {
  games: Game[]
  loading: boolean
  playingKey: string | null
  onPlay: (g: Game) => void
  onOpen: (g: Game) => void
  onGoLibrary: (launcher?: string) => void
  onGoSettings: () => void
  onRescan: () => void
}

const RAIL_MAX = 14
const RECENT_ADD_WINDOW = 14 * 24 * 60 * 60 * 1000

export function HomeView({ games, loading, playingKey, onPlay, onOpen, onGoLibrary, onGoSettings, onRescan }: Props) {
  const byTitle = (a: Game, b: Game) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })

  const recent = React.useMemo(() => games.filter((g) => (g.lastPlayedAt || 0) > 0).sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0)), [games])
  const mostPlayed = React.useMemo(() => games.filter((g) => (g.playtimeMinutes || 0) > 0).sort((a, b) => (b.playtimeMinutes || 0) - (a.playtimeMinutes || 0)), [games])
  const recentlyAdded = React.useMemo(() => {
    const cutoff = Date.now() - RECENT_ADD_WINDOW
    return games.filter((g) => (g.addedAt || 0) >= cutoff).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
  }, [games])
  const launchers = React.useMemo(() => {
    const map = new Map<string, Game[]>()
    for (const g of games) map.set(g.launcher, [...(map.get(g.launcher) || []), g])
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [games])

  const hero = recent[0] || mostPlayed[0] || games.slice().sort(byTitle)[0] || null
  const heroKey = hero ? gameKey(hero) : null
  const jumpBackIn = recent.filter((g) => gameKey(g) !== heroKey).slice(0, RAIL_MAX)

  if (!loading && games.length === 0) {
    return (
      <div className="view view-home" data-nav-root>
        <EmptyState
          icon={<IconLibrary size={40} />}
          title="No games found yet"
          body="Game Librarian scans Steam, Epic, GOG, Ubisoft Connect and Xbox installs. If your launchers live somewhere unusual, point Settings at them and rescan."
          action={{ label: 'Update launcher locations', onClick: onGoSettings }}
        />
        <div className="empty-secondary"><button className="btn btn-ghost" data-nav onClick={onRescan}>Rescan now</button></div>
      </div>
    )
  }

  return (
    <div className="view view-home">
      {hero && (
        <section className="hero" aria-label="Continue playing">
          <div className="hero-bg"><Cover game={hero} kind="hero" eager /></div>
          <div className="hero-content">
            <Cover game={hero} className="hero-cover" eager />
            <div className="hero-text">
              <div className="hero-kicker">{hero.lastPlayedAt ? 'Continue playing' : hero.playtimeMinutes ? 'Most played' : 'Start something'}</div>
              <h1 className="hero-title">{hero.title}</h1>
              <div className="hero-meta">
                <span className="chip chip-launcher">{launcherLabel(hero.launcher)}</span>
                <span>{formatMinutes(hero.playtimeMinutes ?? 0)} played</span>
                <span>·</span>
                <span>{formatRelative(hero.lastPlayedAt)}</span>
                {playingKey === heroKey && <span className="chip chip-live">Playing now</span>}
              </div>
              <div className="hero-actions">
                <button className="btn btn-accent btn-lg" data-nav data-nav-default onClick={() => onPlay(hero)}>
                  <IconPlay size={18} /> Play
                </button>
                <button className="btn btn-ghost btn-lg" data-nav onClick={() => onOpen(hero)}>
                  <IconInfo size={18} /> Details
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <Rail title="Jump back in" games={jumpBackIn} onPlay={onPlay} onOpen={onOpen} playingKey={playingKey} action={{ label: 'View library', onClick: () => onGoLibrary() }} />
      <Rail title="Most played" games={mostPlayed.slice(0, RAIL_MAX)} onPlay={onPlay} onOpen={onOpen} playingKey={playingKey} />
      <Rail title="Recently added" games={recentlyAdded.slice(0, RAIL_MAX)} onPlay={onPlay} onOpen={onOpen} playingKey={playingKey} />
      {launchers.map(([launcher, list]) => (
        <Rail
          key={launcher}
          title={launcherLabel(launcher)}
          games={list.slice().sort(byTitle).slice(0, RAIL_MAX)}
          onPlay={onPlay}
          onOpen={onOpen}
          playingKey={playingKey}
          action={list.length > RAIL_MAX ? { label: `All ${list.length}`, onClick: () => onGoLibrary(launcher) } : undefined}
        />
      ))}
      {loading && games.length === 0 && (
        <div className="skeleton-rails" aria-hidden>
          {[0, 1].map((r) => (
            <div key={r} className="rail"><div className="rail-head"><div className="skeleton skeleton-text" /></div>
              <div className="rail-scroller">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="skeleton skeleton-tile" />)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

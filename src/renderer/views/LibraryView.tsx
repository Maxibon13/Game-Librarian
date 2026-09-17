import React from 'react'
import type { Game, SortOrder, ViewMode } from '../lib/types'
import { gameKey, launcherLabel } from '../lib/types'
import { GameTile } from '../components/GameTile'
import { VirtualGrid } from '../components/VirtualGrid'
import { EmptyState } from '../components/EmptyState'
import { Select } from '../components/Select'
import { IconGrid, IconGridSmall, IconList, IconRefresh, IconSearch } from '../components/Icons'

type Props = {
  games: Game[]
  allGames: Game[]
  query: string
  onClearQuery: () => void
  viewMode: ViewMode
  onViewMode: (v: ViewMode) => void
  sortOrder: SortOrder
  onSort: (s: SortOrder) => void
  launcherFilter: string | null
  onLauncherFilter: (l: string | null) => void
  playingKey: string | null
  refreshing: boolean
  loading: boolean
  onRescan: () => void
  onPlay: (g: Game) => void
  onOpen: (g: Game) => void
  onGoSettings: () => void
  scrollRef: React.RefObject<HTMLElement>
}

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'az', label: 'Name A → Z' },
  { value: 'za', label: 'Name Z → A' },
  { value: 'recent', label: 'Recently played' },
  { value: 'playtime-desc', label: 'Most played' },
  { value: 'playtime-asc', label: 'Least played' }
]

export function LibraryView(p: Props) {
  const { games, allGames, query, viewMode, sortOrder, launcherFilter, playingKey } = p
  const launchers = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const g of allGames) counts.set(g.launcher, (counts.get(g.launcher) || 0) + 1)
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [allGames])

  const gridSpec = viewMode === 'grid'
    ? { minTileWidth: 184, aspect: 1.5, captionHeight: 0, gap: 16 }
    : viewMode === 'compact'
      ? { minTileWidth: 132, aspect: 1.5, captionHeight: 0, gap: 12 }
      : { minTileWidth: 100000, aspect: 0, captionHeight: 68, gap: 8 }

  const render = React.useCallback((g: Game, i: number) => (
    <GameTile
      game={g}
      variant={viewMode === 'list' ? 'list' : 'portrait'}
      onPlay={p.onPlay}
      onOpen={p.onOpen}
      playing={playingKey === gameKey(g)}
      isDefault={i === 0}
    />
  ), [viewMode, p.onPlay, p.onOpen, playingKey])

  return (
    <div className="view view-library">
      <div className="library-toolbar">
        <div className="chips" role="tablist" aria-label="Filter by launcher">
          <button className={`chip-btn ${launcherFilter === null ? 'is-active' : ''}`} data-nav onClick={() => p.onLauncherFilter(null)}>
            All <span className="count">{allGames.length}</span>
          </button>
          {launchers.map(([l, n]) => (
            <button key={l} className={`chip-btn ${launcherFilter === l ? 'is-active' : ''}`} data-nav onClick={() => p.onLauncherFilter(launcherFilter === l ? null : l)}>
              {launcherLabel(l)} <span className="count">{n}</span>
            </button>
          ))}
        </div>
        <div className="library-tools">
          <Select value={sortOrder} options={SORT_OPTIONS} onChange={(v) => p.onSort(v as SortOrder)} ariaLabel="Sort order" />
          <div className="seg" role="group" aria-label="View mode">
            <button className={viewMode === 'grid' ? 'is-active' : ''} data-nav title="Covers" onClick={() => p.onViewMode('grid')}><IconGrid size={18} /></button>
            <button className={viewMode === 'compact' ? 'is-active' : ''} data-nav title="Compact" onClick={() => p.onViewMode('compact')}><IconGridSmall size={18} /></button>
            <button className={viewMode === 'list' ? 'is-active' : ''} data-nav title="List" onClick={() => p.onViewMode('list')}><IconList size={18} /></button>
          </div>
          <button className="icon-btn" data-nav title="Rescan launchers" disabled={p.refreshing} onClick={p.onRescan}>
            <IconRefresh size={18} className={p.refreshing ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {p.loading && allGames.length === 0 && (
        <div className="grid-skeleton" aria-hidden>
          {Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton skeleton-tile" />)}
        </div>
      )}

      {!p.loading && allGames.length === 0 && (
        <EmptyState
          title="Your library is empty"
          body="Check your launcher locations, then save and rescan."
          action={{ label: 'Update launcher locations', onClick: p.onGoSettings }}
        />
      )}

      {allGames.length > 0 && games.length === 0 && (
        <EmptyState
          icon={<IconSearch size={36} />}
          title={query ? `No results for “${query}”` : 'Nothing matches this filter'}
          body={query ? 'Try a shorter search, or check the launcher filter.' : 'Pick another launcher or show all games.'}
          action={{ label: query ? 'Clear search' : 'Show all', onClick: () => { p.onClearQuery(); p.onLauncherFilter(null) } }}
        />
      )}

      {games.length > 0 && (
        <VirtualGrid
          items={games}
          keyOf={gameKey}
          scrollParent={p.scrollRef}
          render={render}
          {...gridSpec}
        />
      )}
    </div>
  )
}

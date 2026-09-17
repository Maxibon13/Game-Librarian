import React from 'react'
import type { Game, Session, Settings, SortOrder, Tab, ViewMode, WindowChrome } from '../lib/types'
import { gameKey } from '../lib/types'
import { api } from '../lib/api'
import { applyTheme } from '../lib/theme'
import { configureAudio, playSound } from '../lib/audio'
import { focusFirst, isTextInput, moveFocus } from '../nav/spatial'
import { useGamepad, type NavAction } from '../nav/useGamepad'
import { TitleBar } from '../components/TitleBar'
import { SideRail } from '../components/SideRail'
import { NowPlayingDock } from '../components/NowPlayingDock'
import { ButtonLegend } from '../components/ButtonLegend'
import { InfoToast, SessionEndedToast, StartingToast } from '../components/Toasts'
import { HomeView } from '../views/HomeView'
import { LibraryView } from '../views/LibraryView'
import { GameDetails } from '../views/GameDetails'
import { SettingsView, type SettingsSection } from '../views/SettingsView'
import { SessionOverlay } from './SessionOverlay'
import { Changelog } from './Changelog'

export type { Game } from '../lib/types'

function normalizeView(v: any): ViewMode {
  if (v === 'large' || v === 'grid') return 'grid'
  if (v === 'small' || v === 'compact') return 'compact'
  if (v === 'list') return 'list'
  return 'grid'
}

export function App() {
  const [games, setGames] = React.useState<Game[]>([])
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [settings, setSettings] = React.useState<Settings | null>(null)
  const [chrome, setChrome] = React.useState<WindowChrome | null>(null)
  const [appVersion, setAppVersion] = React.useState<string | null>(null)
  const [fullscreen, setFullscreen] = React.useState(false)

  const [tab, setTab] = React.useState<Tab>('home')
  const [settingsSection, setSettingsSection] = React.useState<SettingsSection>('appearance')
  const [scanError, setScanError] = React.useState<string | null>(null)
  const [detailsKey, setDetailsKey] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState('')
  const [launcherFilter, setLauncherFilter] = React.useState<string | null>(null)
  const [viewMode, setViewMode] = React.useState<ViewMode>('grid')
  const [sortOrder, setSortOrder] = React.useState<SortOrder>('az')

  const [session, setSession] = React.useState<Session | null>(null)
  const [starting, setStarting] = React.useState<Game | null>(null)
  const [ended, setEnded] = React.useState<{ game: Game; durationMs: number } | null>(null)
  const [focusMode, setFocusMode] = React.useState(false)
  const [toast, setToast] = React.useState<string | null>(null)
  const [showChangelog, setShowChangelog] = React.useState(false)

  const scrollRef = React.useRef<HTMLElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const settingsRef = React.useRef<Settings | null>(null)
  settingsRef.current = settings

  /* ---------- boot ---------- */
  React.useEffect(() => {
    let alive = true
    ;(async () => {
      const [s, c, cfg] = await Promise.all([api.getSettings(), api.getWindowChrome(), api.getAppConfig()])
      if (!alive) return
      if (c) { setChrome(c); setFullscreen(!!c.fullscreen) }
      if (cfg?.appVersion) setAppVersion(String(cfg.appVersion))
      if (s) {
        setSettings(s)
        setViewMode(normalizeView(s.ui?.viewMode))
        if (s.ui?.sort) setSortOrder(s.ui.sort)
        configureAudio({ enabled: s.audio?.enabled !== false, volume: s.audio?.masterVolume ?? 1, profile: s.audio?.profile || 'normal' })
        applyTheme(s.theme?.name || 'dark', { mica: !!c?.mica, platform: c?.platform })
        document.documentElement.dataset.reduceMotion = s.ui?.reduceMotion ? '1' : '0'
      } else {
        applyTheme('dark', { mica: !!c?.mica, platform: c?.platform })
      }
      const list = await api.listGames()
      if (!alive) return
      setGames(Array.isArray(list) ? list : [])
      setScanError(Array.isArray(list) ? (list.length ? null : 'Cannot locate any games.') : 'Unable to scan your game library.')
      setLoading(false)
      const active = await api.getActiveSessions()
      if (alive && active && active.length > 0 && active[0].game) setSession({ game: active[0].game, startedAt: active[0].startedAt })
    })()

    api.onGamesUpdated((list) => {
      if (Array.isArray(list)) {
        setGames(list)
        setScanError(list.length ? null : 'Cannot locate any games.')
      }
    })
    api.onGamesRefreshing((busy) => setRefreshing(busy))
    api.onSessionStart((p) => { setStarting(null); setSession(p) })
    api.onSessionEnd((p) => {
      setSession(null)
      setStarting(null)
      setFocusMode(false)
      if (p?.game && typeof p.durationMs === 'number') {
        if (p.durationMs > 0) setEnded({ game: p.game, durationMs: p.durationMs })
        else setToast(`Could not detect ${p.game.title} running. Playtime was not recorded.`)
      }
    })
    api.onLaunchRequested((g) => { if (g) setStarting(g) })
    api.onFocusSearch(() => { setDetailsKey(null); setTab('library'); requestAnimationFrame(() => searchRef.current?.focus()) })
    api.onWindowState((s) => setFullscreen(!!s.fullscreen))
    return () => { alive = false }
  }, [])

  /* ---------- settings ---------- */
  const patchSettings = React.useCallback(async (patch: Partial<Settings>) => {
    const current = settingsRef.current || (await api.getSettings()) || ({} as Settings)
    const next: Settings = { ...current, ...patch } as Settings
    for (const k of Object.keys(patch) as (keyof Settings)[]) {
      const a = (current as any)[k], b = (patch as any)[k]
      if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) (next as any)[k] = { ...a, ...b }
    }
    setSettings(next)
    settingsRef.current = next
    await api.saveSettings(next)
    if (patch.theme) applyTheme(next.theme?.name || 'dark', { mica: !!chrome?.mica, platform: chrome?.platform })
    if (patch.audio) configureAudio({ enabled: next.audio?.enabled !== false, volume: next.audio?.masterVolume ?? 1, profile: next.audio?.profile || 'normal' })
    if (patch.ui) {
      document.documentElement.dataset.reduceMotion = next.ui?.reduceMotion ? '1' : '0'
      if (patch.ui.viewMode) setViewMode(normalizeView(patch.ui.viewMode))
    }
  }, [chrome])

  const changeView = (v: ViewMode) => { setViewMode(v); void patchSettings({ ui: { ...(settingsRef.current?.ui || {} as any), viewMode: v } }) }
  const changeSort = (s: SortOrder) => { setSortOrder(s); void patchSettings({ ui: { ...(settingsRef.current?.ui || {} as any), sort: s } }) }

  /* ---------- derived ---------- */
  const gamesByKey = React.useMemo(() => {
    const m = new Map<string, Game>()
    for (const g of games) m.set(gameKey(g), g)
    return m
  }, [games])
  const detailsGame = detailsKey ? gamesByKey.get(detailsKey) || null : null
  const playingKey = session ? gameKey(session.game) : null

  const libraryGames = React.useMemo(() => {
    const byTitle = (a: Game, b: Game) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
    const q = query.trim().toLowerCase()
    let list = games
    if (launcherFilter) list = list.filter((g) => g.launcher === launcherFilter)
    if (q) list = list.filter((g) => (g.title || '').toLowerCase().includes(q) || (g.originalTitle || '').toLowerCase().includes(q))
    list = list.slice()
    switch (sortOrder) {
      case 'za': return list.sort(byTitle).reverse()
      case 'recent': return list.sort((a, b) => ((b.lastPlayedAt || 0) - (a.lastPlayedAt || 0)) || byTitle(a, b))
      case 'playtime-desc': return list.sort((a, b) => ((b.playtimeMinutes || 0) - (a.playtimeMinutes || 0)) || byTitle(a, b))
      case 'playtime-asc': return list.sort((a, b) => ((a.playtimeMinutes || 0) - (b.playtimeMinutes || 0)) || byTitle(a, b))
      default: return list.sort(byTitle)
    }
  }, [games, query, launcherFilter, sortOrder])

  /* ---------- actions ---------- */
  const play = React.useCallback((g: Game) => {
    if (session && gameKey(session.game) === gameKey(g)) { setToast(`${g.title} is already running`); return }
    playSound('launch')
    setStarting(g)
    void api.launchGame(g)
  }, [session])

  const forceQuit = React.useCallback((g: Game) => { void api.forceQuit(g) }, [])

  const openDetails = React.useCallback((g: Game) => {
    playSound('open')
    setDetailsKey(gameKey(g))
  }, [])

  const closeDetails = React.useCallback(() => {
    const k = detailsKey
    playSound('close')
    setDetailsKey(null)
    if (k) requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-game-key="${CSS.escape(k)}"]`)
      if (el) el.focus({ preventScroll: false }); else focusFirst()
    })
  }, [detailsKey])

  const goTab = React.useCallback((t: Tab, opts?: { launcher?: string | null }) => {
    setDetailsKey(null)
    setTab(t)
    if (opts && 'launcher' in opts) setLauncherFilter(opts.launcher ?? null)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [])

  const back = React.useCallback(() => {
    if (showChangelog) { setShowChangelog(false); return }
    if (focusMode) { setFocusMode(false); return }
    if (detailsKey) { closeDetails(); return }
    if (tab !== 'home') { goTab('home'); return }
  }, [showChangelog, focusMode, detailsKey, closeDetails, tab, goTab])

  const goLibraryPaths = React.useCallback(() => {
    setSettingsSection('library')
    goTab('settings')
  }, [goTab])

  const rescan = React.useCallback(async () => {
    setRefreshing(true)
    setScanError(null)
    const list = await api.rescanGames()
    if (Array.isArray(list)) setGames(list)
    setScanError(Array.isArray(list) ? (list.length ? null : 'Cannot locate any games.') : 'Unable to scan your game library.')
    setRefreshing(false)
  }, [])

  const toggleFullscreen = React.useCallback(() => { void api.toggleFullscreen().then((v) => { if (typeof v === 'boolean') setFullscreen(v) }) }, [])

  /* ---------- focus management ---------- */
  React.useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (isTextInput(document.activeElement)) return
      if (!detailsKey && tab === 'library' && document.activeElement && document.activeElement !== document.body) return
      focusFirst()
    })
    return () => cancelAnimationFrame(id)
  }, [tab, detailsKey, showChangelog])

  /* ---------- input: gamepad ---------- */
  const focusedGame = () => {
    const el = document.activeElement as HTMLElement | null
    const k = el?.closest<HTMLElement>('[data-game-key]')?.dataset.gameKey
    return k ? gamesByKey.get(k) || null : null
  }
  const launcherOrder = React.useMemo(() => Array.from(new Set(games.map((g) => g.launcher))), [games])
  const cycleLauncher = (dir: 1 | -1) => {
    const order: (string | null)[] = [null, ...launcherOrder]
    const i = order.indexOf(launcherFilter)
    setLauncherFilter(order[(i + dir + order.length) % order.length])
  }
  const onGamepadAction = (a: NavAction) => {
    switch (a) {
      case 'up': case 'down': case 'left': case 'right': moveFocus(a); break
      case 'accept': {
        if (isTextInput(document.activeElement)) { (document.activeElement as HTMLElement).blur(); break }
        const g = focusedGame()
        if (g && !detailsKey) play(g)
        else (document.activeElement as HTMLElement | null)?.click()
        break
      }
      case 'back': back(); break
      case 'details': { const g = focusedGame(); if (g) openDetails(g); break }
      case 'alt': if (tab === 'library' && !detailsKey) searchRef.current?.focus(); break
      case 'prevTab': if (tab === 'library' && !detailsKey) cycleLauncher(-1); else goTab(tab === 'settings' ? 'library' : 'home'); break
      case 'nextTab': if (tab === 'library' && !detailsKey) cycleLauncher(1); else goTab(tab === 'home' ? 'library' : 'settings'); break
      case 'menu': goTab(tab === 'settings' ? 'home' : 'settings'); break
      case 'view': goTab('home'); break
    }
  }
  const { connected: gamepadConnected } = useGamepad(onGamepadAction, true)
  const gamepadSeen = React.useRef(false)
  React.useEffect(() => {
    if (gamepadConnected && !gamepadSeen.current) {
      gamepadSeen.current = true
      setToast('Controller connected')
      if (settingsRef.current?.ui?.fullscreenOnGamepad && !fullscreen) void api.toggleFullscreen(true)
      focusFirst()
    }
    if (!gamepadConnected) gamepadSeen.current = false
  }, [gamepadConnected, fullscreen])

  /* ---------- input: keyboard ---------- */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); return }
      const inText = isTextInput(document.activeElement)
      if (inText) {
        if (e.key === 'Escape') (document.activeElement as HTMLElement).blur()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      switch (e.key) {
        case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': {
          const dir = e.key.replace('Arrow', '').toLowerCase() as 'up' | 'down' | 'left' | 'right'
          if (moveFocus(dir)) e.preventDefault()
          break
        }
        case 'Escape': case 'Backspace': e.preventDefault(); back(); break
        case '/': e.preventDefault(); if (tab !== 'library' || detailsKey) goTab('library'); requestAnimationFrame(() => searchRef.current?.focus()); break
        case 'f': case 'F': { const g = focusedGame(); if (g && !detailsKey) { e.preventDefault(); openDetails(g) } break }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* ---------- render ---------- */
  const legend = detailsGame
    ? [{ glyph: 'A', label: session && playingKey === detailsKey ? 'Force quit' : 'Play' }, { glyph: 'B', label: 'Back' }]
    : tab === 'settings'
      ? [{ glyph: 'A', label: 'Select' }, { glyph: 'B', label: 'Home' }, { glyph: 'LB', label: 'Library' }]
      : [{ glyph: 'A', label: 'Play' }, { glyph: 'Y', label: 'Details' }, { glyph: 'B', label: tab === 'home' ? 'Back' : 'Home' }, { glyph: 'LB', label: tab === 'library' ? 'Filter' : 'Tab' }, { glyph: 'RB', label: tab === 'library' ? 'Filter' : 'Tab' }, { glyph: '☰', label: 'Settings' }]

  const showFocusOverlay = !!session && (focusMode || !!settings?.ui?.sessionFocusMode)

  return (
    <div className={`shell ${fullscreen ? 'is-fullscreen' : ''} ${gamepadConnected ? 'has-gamepad' : ''}`}>
      <TitleBar
        tab={tab}
        chrome={chrome}
        fullscreen={fullscreen}
        gamepadConnected={gamepadConnected}
        refreshing={refreshing}
        query={query}
        onQuery={(q) => { setQuery(q); if (detailsKey) setDetailsKey(null); if (tab !== 'library') setTab('library') }}
        onToggleFullscreen={toggleFullscreen}
        searchRef={searchRef}
        onSearchSubmit={() => focusFirst()}
      />
      <div className="shell-body">
        <SideRail tab={tab} onTab={(t) => goTab(t)} count={games.length} version={appVersion} />
        <main className="content" ref={scrollRef as React.RefObject<HTMLElement>}>
          {scanError && !loading && !refreshing && (
            <div className="scan-error" role="alert">
              <div><strong>{scanError}</strong><p>Check your launcher locations, then save and rescan.</p></div>
              <button className="btn btn-accent" data-nav onClick={goLibraryPaths}>Update launcher locations</button>
            </div>
          )}
          {detailsGame ? (
            <GameDetails
              game={detailsGame}
              session={session && playingKey === detailsKey ? session : null}
              starting={!!starting && gameKey(starting) === detailsKey}
              onPlay={play}
              onForceQuit={forceQuit}
              onBack={closeDetails}
              onToast={setToast}
            />
          ) : tab === 'home' ? (
            <HomeView
              games={games}
              loading={loading || refreshing}
              playingKey={playingKey}
              onPlay={play}
              onOpen={openDetails}
              onGoLibrary={(launcher) => goTab('library', { launcher: launcher ?? null })}
              onGoSettings={goLibraryPaths}
              onRescan={rescan}
            />
          ) : tab === 'library' ? (
            <LibraryView
              games={libraryGames}
              allGames={games}
              query={query}
              onClearQuery={() => setQuery('')}
              viewMode={viewMode}
              onViewMode={changeView}
              sortOrder={sortOrder}
              onSort={changeSort}
              launcherFilter={launcherFilter}
              onLauncherFilter={setLauncherFilter}
              playingKey={playingKey}
              refreshing={refreshing}
              loading={loading || refreshing}
              onRescan={rescan}
              onPlay={play}
              onOpen={openDetails}
              onGoSettings={goLibraryPaths}
              scrollRef={scrollRef}
            />
          ) : settings ? (
            <SettingsView
              section={settingsSection}
              onSectionChange={setSettingsSection}
              settings={settings}
              onPatch={patchSettings}
              onRescan={rescan}
              appVersion={appVersion}
              chrome={chrome}
              onOpenChangelog={() => setShowChangelog(true)}
              onToast={setToast}
            />
          ) : null}
        </main>
      </div>

      <ButtonLegend items={legend} visible={gamepadConnected} />

      {session && !showFocusOverlay && (
        <NowPlayingDock
          session={session}
          onForceQuit={() => forceQuit(session.game)}
          onOpen={() => openDetails(session.game)}
          onFocusMode={() => setFocusMode(true)}
        />
      )}
      {showFocusOverlay && session && (
        <SessionOverlay
          game={session.game}
          startedAt={session.startedAt}
          onForceQuit={() => forceQuit(session.game)}
          onMinimize={() => { setFocusMode(false); if (settings?.ui?.sessionFocusMode) void patchSettings({ ui: { ...(settings.ui as any), sessionFocusMode: false } }) }}
        />
      )}

      <div className="toasts">
        {starting && !session && <StartingToast game={starting} onAbort={() => { forceQuit(starting); setStarting(null) }} />}
        {ended && <SessionEndedToast game={ended.game} durationMs={ended.durationMs} onClose={() => setEnded(null)} onOpen={() => { openDetails(ended.game); setEnded(null) }} />}
        {toast && <InfoToast text={toast} onClose={() => setToast(null)} />}
      </div>

      {showChangelog && <Changelog onClose={() => setShowChangelog(false)} />}
    </div>
  )
}

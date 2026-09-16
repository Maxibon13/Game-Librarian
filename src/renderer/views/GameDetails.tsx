import React from 'react'
import type { Game, Session } from '../lib/types'
import { launcherLabel } from '../lib/types'
import { formatElapsed, formatMinutes, formatRelative } from '../lib/format'
import { api } from '../lib/api'
import { Cover } from '../components/Cover'
import { IconBack, IconEdit, IconFolder, IconPin, IconPlay, IconStop } from '../components/Icons'

type Props = {
  game: Game
  session: Session | null
  starting: boolean
  onPlay: (g: Game) => void
  onForceQuit: (g: Game) => void
  onBack: () => void
  onToast: (text: string) => void
}

// Full-screen game page (replaces the old modal menu).
export function GameDetails({ game, session, starting, onPlay, onForceQuit, onBack, onToast }: Props) {
  const [editing, setEditing] = React.useState(false)
  const [title, setTitle] = React.useState(game.title)
  const [now, setNow] = React.useState(Date.now())
  const isPlaying = !!session

  React.useEffect(() => { setTitle(game.title); setEditing(false) }, [game.title])
  React.useEffect(() => {
    if (!isPlaying) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [isPlaying])

  async function saveRename() {
    const next = title.trim()
    setEditing(false)
    if (!next || next === game.title) { setTitle(game.title); return }
    await api.setCustomTitle(game.launcher, String(game.id), next === game.originalTitle ? '' : next)
    onToast('Title updated')
  }

  async function reveal() {
    const p = game.executablePath || game.installDir
    if (!p) { onToast('No install location known for this game'); return }
    const ok = await api.revealPath(p)
    if (!ok) onToast('Could not open the install folder')
  }

  async function pin() {
    const res = await api.createStartShortcut(game)
    onToast(res?.ok ? 'Added to Start menu' : `Could not create shortcut${res?.error ? `: ${res.error}` : ''}`)
  }

  const isLauncherLike = /launcher/i.test(game.originalTitle || game.title)

  return (
    <div className="view view-details" data-nav-root>
      <div className="details-bg"><Cover game={game} kind="hero" eager /></div>
      <div className="details-top">
        <button className="btn btn-ghost" data-nav onClick={onBack}><IconBack size={18} /> Back</button>
      </div>
      <div className="details-main">
        <Cover game={game} className="details-cover" eager />
        <div className="details-text">
          <div className="details-kicker">{launcherLabel(game.launcher)}</div>
          {editing ? (
            <form className="rename" onSubmit={(e) => { e.preventDefault(); void saveRename() }}>
              <input
                className="rename-input"
                value={title}
                autoFocus
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); setTitle(game.title) } }}
                aria-label="Game title"
              />
              <button className="btn btn-accent" type="submit" data-nav>Save</button>
              <button className="btn btn-ghost" type="button" data-nav onClick={() => { setEditing(false); setTitle(game.title) }}>Cancel</button>
            </form>
          ) : (
            <h1 className="details-title">{game.title}</h1>
          )}
          <div className="details-meta">
            <span className="stat"><strong>{formatMinutes(game.playtimeMinutes ?? 0)}</strong><small>played</small></span>
            <span className="stat"><strong>{formatRelative(game.lastPlayedAt)}</strong><small>last played</small></span>
            {game.addedAt ? <span className="stat"><strong>{formatRelative(game.addedAt)}</strong><small>added</small></span> : null}
            {isPlaying && <span className="stat live"><strong>{formatElapsed(now - session!.startedAt)}</strong><small>this session</small></span>}
          </div>
          <div className="details-actions">
            {isPlaying ? (
              <button className="btn btn-danger btn-lg" data-nav data-nav-default onClick={() => onForceQuit(game)}><IconStop size={18} /> Force quit</button>
            ) : (
              <button className="btn btn-accent btn-lg" data-nav data-nav-default disabled={starting} onClick={() => onPlay(game)}>
                <IconPlay size={18} /> {starting ? 'Starting…' : 'Play'}
              </button>
            )}
            <button className="btn btn-ghost" data-nav onClick={reveal}><IconFolder size={18} /> Manage files</button>
            <button className="btn btn-ghost" data-nav onClick={() => setEditing(true)}><IconEdit size={18} /> Rename</button>
            <button className="btn btn-ghost" data-nav onClick={pin}><IconPin size={18} /> Pin to Start</button>
          </div>
          {isLauncherLike && (
            <div className="notice">This entry looks like a launcher. Playtime may not record correctly for it.</div>
          )}
          <dl className="details-info">
            {game.originalTitle && game.originalTitle !== game.title && (<><dt>Original title</dt><dd>{game.originalTitle}</dd></>)}
            <dt>Launcher</dt><dd>{launcherLabel(game.launcher)}</dd>
            <dt>Id</dt><dd className="mono">{String(game.id)}</dd>
            {game.installDir && (<><dt>Install folder</dt><dd className="mono" title={game.installDir}>{game.installDir}</dd></>)}
            {game.executablePath && (<><dt>Executable</dt><dd className="mono" title={game.executablePath}>{game.executablePath}</dd></>)}
          </dl>
        </div>
      </div>
    </div>
  )
}

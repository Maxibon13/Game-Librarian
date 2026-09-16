import React from 'react'
import type { Game } from '../lib/types'
import { formatElapsed } from '../lib/format'
import { Cover } from './Cover'

export function StartingToast({ game, onAbort }: { game: Game; onAbort: () => void }) {
  return (
    <div className="toast toast-starting" role="status">
      <Cover game={game} className="toast-cover" eager />
      <div className="toast-body">
        <div className="toast-title">Starting {game.title}</div>
        <div className="toast-sub">Waiting for the game process…</div>
        <div className="progress"><span /></div>
      </div>
      <button className="btn btn-ghost btn-sm" data-nav onClick={onAbort}>Abort</button>
    </div>
  )
}

export function SessionEndedToast({ game, durationMs, onClose, onOpen }: { game: Game; durationMs: number; onClose: () => void; onOpen: () => void }) {
  React.useEffect(() => {
    const t = setTimeout(onClose, 9000)
    return () => clearTimeout(t)
  }, [onClose])
  return (
    <div className="toast toast-ended" role="status">
      <Cover game={game} className="toast-cover" eager />
      <div className="toast-body">
        <div className="toast-title">{game.title}</div>
        <div className="toast-sub">Session ended · {formatElapsed(durationMs)}</div>
      </div>
      <button className="btn btn-ghost btn-sm" data-nav onClick={onOpen}>Details</button>
      <button className="btn btn-ghost btn-sm" data-nav onClick={onClose}>Dismiss</button>
    </div>
  )
}

export function InfoToast({ text, onClose }: { text: string; onClose: () => void }) {
  React.useEffect(() => {
    const t = setTimeout(onClose, 4500)
    return () => clearTimeout(t)
  }, [onClose])
  return (
    <div className="toast" role="status">
      <div className="toast-body"><div className="toast-title">{text}</div></div>
    </div>
  )
}

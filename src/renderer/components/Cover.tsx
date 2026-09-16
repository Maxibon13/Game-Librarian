import React from 'react'
import type { Game } from '../lib/types'
import { placeholderHue, useCover } from '../lib/cover'

type Props = {
  game: Game
  kind?: 'portrait' | 'hero'
  className?: string
  eager?: boolean
}

export function Cover({ game, kind = 'portrait', className = '', eager = false }: Props) {
  const url = useCover(game, kind)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => { setFailed(false) }, [url])
  const hue = placeholderHue(game.title || '')
  const showImg = !!url && !failed
  return (
    <div className={`cover ${className}`} style={{ ['--ph-hue' as any]: hue }}>
      {showImg && (
        <img
          src={url!}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
      {!showImg && (
        <div className="cover-placeholder">
          <span>{initials(game.title)}</span>
        </div>
      )}
    </div>
  )
}

function initials(title: string) {
  const words = String(title || '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('')
}

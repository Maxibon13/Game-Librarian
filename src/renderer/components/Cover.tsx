import React from 'react'
import type { Game } from '../lib/types'
import { coverSources, placeholderHue, useCover } from '../lib/cover'

type Props = {
  game: Game
  kind?: 'portrait' | 'hero'
  className?: string
  eager?: boolean
}

export function Cover({ game, kind = 'portrait', className = '', eager = false }: Props) {
  const sources = coverSources(game, kind)
  // Remount only when the game or its candidate images change. A failed image
  // advances to the next candidate instead of getting stuck on initials.
  return <CoverImage key={JSON.stringify([game.launcher, game.id, kind, sources])} game={game} sources={sources} className={className} eager={eager} />
}

function CoverImage({ game, sources, className, eager }: Props & { sources: string[] }) {
  const [index, setIndex] = React.useState(0)
  const source = sources[index] || null
  const url = useCover(source)
  const hue = placeholderHue(game.title || '')
  const showImg = !!source && !!url
  return (
    <div className={`cover ${className}`} style={{ ['--ph-hue' as any]: hue }}>
      {showImg && (
        <img
          key={source}
          src={url!}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onError={() => setIndex((i) => i + 1)}
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

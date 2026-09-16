import React from 'react'

type Item = { glyph: string; label: string }

type Props = { items: Item[]; visible: boolean }

// Console-style footer legend, shown only while a gamepad is connected.
export function ButtonLegend({ items, visible }: Props) {
  if (!visible) return null
  return (
    <footer className="legend" aria-label="Controller buttons">
      {items.map((it) => (
        <span key={it.glyph + it.label} className="legend-item">
          <span className={`glyph glyph-${it.glyph.toLowerCase()}`}>{it.glyph}</span>
          <span>{it.label}</span>
        </span>
      ))}
    </footer>
  )
}

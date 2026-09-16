import React from 'react'

export type SelectOption = { value: string; label: string; swatch?: string }

type Props = {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  ariaLabel?: string
  className?: string
}

// Custom dropdown with keyboard + spatial-nav support (options are `data-nav`).
export function Select({ value, options, onChange, ariaLabel, className = '' }: Props) {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const listRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    requestAnimationFrame(() => {
      const sel = listRef.current?.querySelector<HTMLElement>('.select-item.is-selected') || listRef.current?.querySelector<HTMLElement>('.select-item')
      sel?.focus()
    })
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const current = options.find((o) => o.value === value)

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!open) return
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>('.select-item') || [])
    const idx = items.findIndex((el) => el === document.activeElement)
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); (containerRef.current?.querySelector('button') as HTMLElement | null)?.focus(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); items[Math.min(items.length - 1, idx + 1)]?.focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); items[Math.max(0, idx - 1)]?.focus() }
  }

  return (
    <div className={`select ${className}`} ref={containerRef} onKeyDown={onKey} data-nav-root={open ? true : undefined}>
      <button className="select-display" data-nav aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} onClick={() => setOpen((o) => !o)}>
        {current?.swatch && <span className="swatch" style={{ background: current.swatch }} />}
        <span className="select-label">{current?.label || '—'}</span>
        <span className={`chev ${open ? 'up' : ''}`} aria-hidden>▾</span>
      </button>
      {open && (
        <div ref={listRef} className="select-menu" role="listbox">
          {options.map((opt) => (
            <button
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              data-nav
              className={`select-item ${opt.value === value ? 'is-selected' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false) }}
            >
              {opt.swatch && <span className="swatch" style={{ background: opt.swatch }} />}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

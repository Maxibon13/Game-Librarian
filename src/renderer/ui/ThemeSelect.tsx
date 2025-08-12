import React from 'react'

export type ThemeOption = { value: string; label: string }

type Props = {
  value: string
  options: ThemeOption[]
  onChange: (value: string) => void
}

export function ThemeSelect({ value, options, onChange }: Props) {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const listRef = React.useRef<HTMLDivElement | null>(null)
  const [above, setAbove] = React.useState(false)

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (!containerRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  React.useEffect(() => {
    if (open) {
      // Flip the menu above if not enough space below
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect) {
        const spaceBelow = window.innerHeight - rect.bottom
        const spaceAbove = rect.top
        setAbove(spaceBelow < 240 && spaceAbove > spaceBelow)
      }
      requestAnimationFrame(() => {
        listRef.current?.querySelector<HTMLElement>('.theme-item')?.focus()
      })
    }
  }, [open])

  const current = options.find((o) => o.value === value)?.label || 'Theme'

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!open) return
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>('.theme-item') || [])
    const idx = items.findIndex((el) => el === document.activeElement)
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = items[Math.min(items.length - 1, Math.max(0, idx + 1))]
      next?.focus()
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = items[Math.max(0, idx - 1)]
      prev?.focus()
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const active = document.activeElement as HTMLElement | null
      const val = active?.dataset?.value
      if (val) { onChange(val); setOpen(false) }
    }
  }

  return (
    <div className="theme-select" ref={containerRef} onKeyDown={onKey}>
      <button className="select-display sort-select" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {current}
        <span className={`chev ${open ? 'up' : ''}`} aria-hidden>▾</span>
      </button>
      {open && (
        <div ref={listRef} className={`theme-menu ${above ? 'above' : ''}`} role="listbox">
          {options.map((opt, i) => (
            <button
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              data-value={opt.value}
              className={`theme-item ${opt.value === value ? 'selected' : ''}`}
              style={{ animationDelay: `${i * 45}ms` }}
              onClick={() => { onChange(opt.value); setOpen(false) }}
            >
              <span className="dot" aria-hidden />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}



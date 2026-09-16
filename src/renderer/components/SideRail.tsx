import React from 'react'
import type { Tab } from '../lib/types'
import { IconHome, IconLibrary, IconSettings } from './Icons'

type Props = {
  tab: Tab
  onTab: (t: Tab) => void
  count: number
  version: string | null
}

const items: { id: Tab; label: string; Icon: typeof IconHome }[] = [
  { id: 'home', label: 'Home', Icon: IconHome },
  { id: 'library', label: 'Library', Icon: IconLibrary },
  { id: 'settings', label: 'Settings', Icon: IconSettings }
]

export function SideRail({ tab, onTab, count, version }: Props) {
  return (
    <nav className="siderail" aria-label="Primary">
      <ul>
        {items.map(({ id, label, Icon }) => (
          <li key={id}>
            <button
              className={`siderail-item ${tab === id ? 'is-active' : ''}`}
              onClick={() => onTab(id)}
              data-nav
              aria-current={tab === id ? 'page' : undefined}
            >
              <Icon size={22} />
              <span className="siderail-label">{label}</span>
              {id === 'library' && count > 0 && <span className="siderail-count">{count}</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="siderail-foot">{version || ''}</div>
    </nav>
  )
}

import React from 'react'

type Props = {
  title: string
  body?: string
  action?: { label: string; onClick: () => void }
  icon?: React.ReactNode
}

export function EmptyState({ title, body, action, icon }: Props) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action && <button className="btn btn-accent" data-nav data-nav-default onClick={action.onClick}>{action.label}</button>}
    </div>
  )
}

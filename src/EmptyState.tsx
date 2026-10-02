export function EmptyState({ title, text, action, onClick }: { title: string; text: string; action?: string; onClick?: () => void }) {
  return <div className="empty-state"><span aria-hidden="true">✦</span><h3>{title}</h3><p>{text}</p>{action && onClick && <button className="primary" onClick={onClick}>{action}</button>}</div>
}

import type { ReactNode } from 'react'
import type { StudyWorkspace } from './lib/workspaces'
import { Dialog } from './Dialog'
import { createPortal } from 'react-dom'

export function WorkspaceSwitcher({ selected, open, onOpenChange, children }: {
  selected: StudyWorkspace; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode
}) {
  return <div className="sidebar-workspace">
    <p className="eyebrow">Espacio</p>
    <button className="workspace-context-trigger" title={`Espacio · ${selected.name}`} aria-label={`Cambiar espacio de estudio. Actual: ${selected.name}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => onOpenChange(true)}>
      <span>{selected.emoji}</span><strong>{selected.name}</strong><span aria-hidden="true">⌄</span>
    </button>
    {open && createPortal(<Dialog title="Explorador de espacios" onClose={() => onOpenChange(false)} className="workspace-drawer">
      <header className="workspace-drawer-head"><div><p className="eyebrow">Espacio actual · {selected.name}</p><h2>Espacios</h2></div><button className="workspace-drawer-close" aria-label="Cerrar explorador de espacios" onClick={() => onOpenChange(false)}>×</button></header>{children}
    </Dialog>, document.body)}
  </div>
}

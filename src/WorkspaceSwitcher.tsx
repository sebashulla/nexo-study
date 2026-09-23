import { useEffect, useRef, type ReactNode } from 'react'
import type { StudyWorkspace } from './lib/workspaces'

export function WorkspaceSwitcher({ selected, open, onOpenChange, children }: {
  selected: StudyWorkspace
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onOpenChange(false); triggerRef.current?.focus() }
      if (event.key === 'Tab' && drawerRef.current) {
        const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'))
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (!first || !last) return
        if (event.shiftKey && (document.activeElement === first || document.activeElement === drawerRef.current)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    drawerRef.current?.focus()
    document.addEventListener('keydown', keyboard)
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', keyboard) }
  }, [open, onOpenChange])

  return <>
    <button ref={triggerRef} className="workspace-edge-trigger" title={`Explorador de espacios · ${selected.name}`} aria-label={`Cambiar espacio de estudio. Actual: ${selected.name}`} aria-expanded={open} aria-controls="workspace-drawer" onClick={() => onOpenChange(!open)}>
      <span className="workspace-edge-icon">{selected.emoji}</span><span className="workspace-edge-copy"><small>TU ESPACIO</small><strong>{selected.name}</strong></span><span aria-hidden="true">{open ? '×' : '‹'}</span>
    </button>
    {open && <div className="workspace-drawer-layer"><button className="workspace-drawer-backdrop" aria-label="Cerrar explorador de espacios" onClick={() => onOpenChange(false)}/><aside ref={drawerRef} className="workspace-drawer" id="workspace-drawer" role="dialog" aria-modal="true" aria-label="Explorador de espacios" tabIndex={-1}><header className="workspace-drawer-head"><div><p className="eyebrow">Organiza tu estudio</p><h2>Explorador de espacios</h2><span>Abre un espacio y organiza sus cursos.</span></div><button className="workspace-drawer-close" aria-label="Cerrar explorador de espacios" onClick={() => { onOpenChange(false); triggerRef.current?.focus() }}>×</button></header>{children}</aside></div>}
  </>
}

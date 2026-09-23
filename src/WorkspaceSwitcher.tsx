import { useEffect, useRef, useState } from 'react'
import type { StudyWorkspace } from './lib/workspaces'
import { GENERAL_WORKSPACE } from './lib/workspaces'

export function WorkspaceSwitcher({ selected, folders, counts, onSelect, onManage }: {
  selected: StudyWorkspace
  folders: StudyWorkspace[]
  counts: Record<string, number>
  onSelect: (id: string) => void
  onManage: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])

  const choose = (id: string) => { onSelect(id); setOpen(false) }
  return <div className="workspace-switcher" ref={ref}>
    <button className="workspace-trigger" aria-label={`Cambiar espacio de estudio. Actual: ${selected.name}`} aria-expanded={open} aria-controls="workspace-options" onClick={() => setOpen(value => !value)}>
      <span className="workspace-trigger-icon">{selected.emoji}</span><span className="workspace-trigger-copy"><small>ESPACIO ACTIVO</small><strong>{selected.name}</strong></span><span className="workspace-chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div className="workspace-menu" id="workspace-options" role="group" aria-label="Espacios de estudio">
      <div className="workspace-menu-title">Cambiar de espacio</div>
      {[{ id: GENERAL_WORKSPACE, name: 'General', emoji: '🏠', created_at: '' }, ...folders].map(item =>
        <button key={item.id} className={`workspace-option ${selected.id === item.id ? 'active' : ''}`} aria-current={selected.id === item.id ? 'true' : undefined} onClick={() => choose(item.id)}>
          <span>{item.emoji}</span><span><strong>{item.name}</strong><small>{counts[item.id] ?? 0} cursos</small></span>{selected.id === item.id && <b aria-hidden="true">✓</b>}
        </button>)}
      <button className="workspace-manage" onClick={() => { setOpen(false); onManage() }}>＋ Organizar espacios</button>
    </div>}
  </div>
}

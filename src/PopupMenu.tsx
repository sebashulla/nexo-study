import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Dialog } from './Dialog'
import { useMediaQuery } from './hooks/useMediaQuery'

export function PopupMenu({ label, trigger, triggerClass, menuLabel, children, className = '', routeKey = '', title, mobileSheet = false }: {
  label: string; trigger: ReactNode; triggerClass: string; menuLabel: string; children: ReactNode; className?: string; routeKey?: string; title?: string; mobileSheet?: boolean
}) {
  const sheet = useMediaQuery('(max-width: 700px)') && mobileSheet
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()
  const close = () => {
    setOpen(false)
    // Native dialog teardown restores focus first. WebKit touch does not focus
    // the opener automatically; restore it after teardown unless a new dialog opened.
    requestAnimationFrame(() => { if (!document.querySelector('dialog[open]')) button.current?.focus() })
  }
  useEffect(() => { setOpen(false) }, [routeKey])
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus()
    const outside = (event: PointerEvent) => { if (!sheet && !ref.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open, sheet])
  const items = <div ref={menu} className="account-menu" id={id} role="menu" aria-label={menuLabel} onClick={event => {
      const item = (event.target as HTMLElement).closest('[role="menuitem"]')
      if (item && !item.hasAttribute('data-keep-open')) { if (sheet) close(); else { button.current?.focus(); setOpen(false) } }
    }} onKeyDown={event => {
      // WebKit can focus the containing main on pointerdown, before the item click.
      // Dismiss keyboard departures after Tab has moved focus; pointer departures use outside.
      if (event.key === 'Tab') { if (!sheet) window.setTimeout(() => { if (!ref.current?.contains(document.activeElement)) setOpen(false) }, 0); return }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'))
      const current = items.indexOf(document.activeElement as HTMLButtonElement)
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      items[index]?.focus()
    }}>{children}</div>
  return <div className={`account-wrap ${className}`} ref={ref}>
    <button ref={button} className={triggerClass} aria-label={label} title={title} aria-haspopup={sheet ? 'dialog' : 'menu'} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) } }}>{trigger}</button>
    {open && (sheet ? createPortal(<Dialog title={menuLabel} onClose={close} className="mobile-action-sheet"><h2>{menuLabel}</h2>{items}<button className="secondary full" onClick={close}>Cancelar</button></Dialog>, document.body) : items)}
  </div>
}

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export function PopupMenu({ label, trigger, triggerClass, menuLabel, children, className = '', routeKey = '', title }: {
  label: string; trigger: ReactNode; triggerClass: string; menuLabel: string; children: ReactNode; className?: string; routeKey?: string; title?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => { setOpen(false) }, [routeKey])
  useEffect(() => {
    if (!open) return
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus()
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); button.current?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div className={`account-wrap ${className}`} ref={ref}>
    <button ref={button} className={triggerClass} aria-label={label} title={title} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) } }}>{trigger}</button>
    {open && <div className="account-menu" id={id} role="menu" aria-label={menuLabel} onClick={event => {
      const item = (event.target as HTMLElement).closest('[role="menuitem"]')
      if (item && !item.hasAttribute('data-keep-open')) { button.current?.focus(); setOpen(false) }
    }} onKeyDown={event => {
      // WebKit can focus the containing main on pointerdown, before the item click.
      // Dismiss keyboard departures after Tab has moved focus; pointer departures use outside.
      if (event.key === 'Tab') { window.setTimeout(() => { if (!ref.current?.contains(document.activeElement)) setOpen(false) }, 0); return }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'))
      const current = items.indexOf(document.activeElement as HTMLButtonElement)
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      items[index]?.focus()
    }}>{children}</div>}
  </div>
}

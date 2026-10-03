import { useLayoutEffect, useRef } from 'react'
import { useBodyScrollLock } from './hooks/useBodyScrollLock'

/** Native dialogs provide focus trapping, Escape and inert background content. */
export function Dialog({ title, onClose, children, className = '' }: {
  title: string; onClose: () => void; children: React.ReactNode; className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useBodyScrollLock(true)
  useLayoutEffect(() => {
    const dialog = ref.current!
    const previousFocus = document.activeElement as HTMLElement | null
    dialog.showModal()
    return () => {
      dialog.close()
      if (previousFocus?.isConnected && previousFocus.offsetParent !== null) previousFocus.focus()
      else document.getElementById('main-content')?.focus()
    }
  }, [])
  return <dialog ref={ref} aria-label={title} className={`nexo-dialog ${className}`}
    onKeyDown={event => {
      if (event.key !== 'Tab') return
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]')].filter(item => item.offsetParent !== null)
      if (!items.length) { event.preventDefault(); return }
      const index = items.indexOf(document.activeElement as HTMLElement)
      if (index < 0 || event.shiftKey && index === 0 || !event.shiftKey && index === items.length-1) {
        event.preventDefault(); items[event.shiftKey ? items.length-1 : 0].focus()
      }
    }}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) {
      const box = event.currentTarget.getBoundingClientRect()
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose()
    } }}>
    {children}
  </dialog>
}

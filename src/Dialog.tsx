import { useLayoutEffect, useRef } from 'react'

/** Native dialogs provide focus trapping, Escape and inert background content. */
export function Dialog({ title, onClose, children, className = '' }: {
  title: string; onClose: () => void; children: React.ReactNode; className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const dialog = ref.current!
    const previousFocus = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      previousFocus?.focus()
    }
  }, [])
  return <dialog ref={ref} aria-label={title} className={`nexo-dialog ${className}`}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) {
      const box = event.currentTarget.getBoundingClientRect()
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose()
    } }}>
    {children}
  </dialog>
}

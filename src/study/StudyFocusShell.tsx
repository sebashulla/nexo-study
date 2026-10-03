import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { PopupMenu } from '../PopupMenu'

const ProgressContext = createContext<((value: string) => void) | null>(null)

export function useStudyProgress(value: string) {
  const report = useContext(ProgressContext)
  useLayoutEffect(() => { report?.(value); return () => report?.('') }, [report, value])
}

/** Keeps the existing task and tracking callbacks; only phones enter a dedicated study surface. */
export function StudyFocusShell({ title, onBack, children, actions, counter = '', enabled = true }: {
  title: string; onBack: () => void; children: ReactNode; actions?: ReactNode; counter?: string; enabled?: boolean
}) {
  const mobile = useMediaQuery('(max-width: 700px)')
  const active = mobile && enabled
  const [progress, setProgress] = useState('')
  const back = useRef<HTMLButtonElement>(null)
  const shell = useRef<HTMLElement>(null)
  useBodyScrollLock(active)
  useLayoutEffect(() => {
    if (!active) return
    const previous = document.activeElement as HTMLElement | null
    // Inert only the branches outside this task. Keep the task in the same React
    // position across breakpoints so unfinished answers and exam position survive.
    const blocked: { node: HTMLElement; inert: boolean }[] = []
    let branch: HTMLElement | null = shell.current
    while (branch?.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          blocked.push({ node: sibling, inert: sibling.inert })
          sibling.inert = true
        }
      }
      if (branch.parentElement === document.body) break
      branch = branch.parentElement
    }
    back.current?.focus({ preventScroll: true })
    return () => {
      for (const { node, inert } of blocked) node.inert = inert
      if (previous?.isConnected && previous.offsetParent !== null) previous.focus({ preventScroll: true })
      else document.getElementById('main-content')?.focus({ preventScroll: true })
    }
  }, [active])
  const content = <section ref={shell} className={active ? 'study-focus-shell' : 'study-browse-shell'} aria-label={active ? title : undefined}>
    {active && <header className="study-focus-header"><button ref={back} className="text-button" aria-label="Volver al material o curso" onClick={onBack}>←</button><h2>{title}</h2><span className="study-focus-counter" aria-live="polite">{progress || counter}</span>{actions && <PopupMenu label="Opciones de estudio" trigger="···" triggerClass="context-menu-trigger" menuLabel="Opciones de estudio" mobileSheet>{actions}</PopupMenu>}</header>}
    <div className={active ? 'study-focus-content' : 'study-browse-content'}>{children}</div>
  </section>
  return <ProgressContext.Provider value={active ? setProgress : null}>{content}</ProgressContext.Provider>
}

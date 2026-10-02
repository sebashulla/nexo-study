import { useLayoutEffect } from 'react'

const locks = new Set<symbol>()
let previousOverflow = ''

/** A nested dialog must not lose its lock when the navigation behind it closes. */
export function useBodyScrollLock(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return
    const lock = Symbol('nexo-scroll-lock')
    if (!locks.size) previousOverflow = document.body.style.overflow
    locks.add(lock)
    document.body.style.overflow = 'hidden'
    return () => { locks.delete(lock); document.body.style.overflow = locks.size ? 'hidden' : previousOverflow }
  }, [active])
}

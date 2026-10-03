import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'

export function StudyTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const mobile = useMediaQuery('(max-width: 700px)')
  useLayoutEffect(() => {
    const textarea = ref.current
    if (!textarea) return
    if (!mobile) { textarea.style.height = ''; return }
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 144), 280)}px`
  }, [props.value, mobile])
  return <textarea {...props} ref={ref}/>
}

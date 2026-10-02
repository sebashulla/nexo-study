import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Icon } from './Icon'
import { imageLimits, type ImageAttachment } from './lib/imageUtils'

export function ChatComposer({ value, onChange, onSend, label, placeholder, busy, disabled = false, className = '', children, textareaRef, images, onImport, onRemove, imageBusy = false, deep, onDeepChange, sendLabel = 'Preguntar a Nexo', enterToSend = false }: {
  value: string; onChange: (value: string) => void; onSend: () => void; label: string; placeholder: string
  busy: boolean; disabled?: boolean; className?: string; children?: ReactNode; textareaRef?: RefObject<HTMLTextAreaElement | null>
  images?: ImageAttachment[]; onImport?: (files: File[]) => void; onRemove?: (id: string) => void; imageBusy?: boolean
  deep?: boolean; onDeepChange?: (value: boolean) => void; sendLabel?: string; enterToSend?: boolean
}) {
  const ownRef = useRef<HTMLTextAreaElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const ref = textareaRef ?? ownRef
  const [dragging, setDragging] = useState(false)
  useEffect(() => { const textarea = ref.current; if (textarea) { textarea.style.height = 'auto'; textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px` } }, [value, ref])
  const importFiles = (files: File[]) => { onImport?.(files.filter(file => file.type.startsWith('image/'))); if (inputRef.current) inputRef.current.value = '' }
  const blocked = disabled || busy || imageBusy
  return <div className={`nexo-composer ${className} ${dragging ? 'dragging' : ''}`}
    onDragOver={onImport ? event => { event.preventDefault(); if (!blocked) setDragging(true) } : undefined}
    onDragLeave={() => setDragging(false)} onDrop={onImport ? event => { event.preventDefault(); setDragging(false); if (!blocked) importFiles(Array.from(event.dataTransfer.files)) } : undefined}>
    {children}
    {onImport && <input ref={inputRef} hidden multiple type="file" accept="image/png,image/jpeg,image/webp" onChange={event => importFiles(Array.from(event.target.files ?? []))}/>}
    {!!images?.length && <div className="solver-attachments">{images.map((image, index) => <div key={image.id}><img src={image.dataUrl} alt={`Adjunto ${index + 1}`}/><button aria-label={`Quitar ${image.name}`} disabled={blocked} onClick={() => onRemove?.(image.id)}>×</button></div>)}<small>{images.length}/{imageLimits.maxImages} imágenes</small></div>}
    <textarea ref={ref} aria-label={label} rows={2} placeholder={placeholder} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} onPaste={onImport ? event => {
      const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'))
      if (files.length && !blocked) { event.preventDefault(); importFiles(files) }
    } : undefined} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && !event.shiftKey && (enterToSend || event.ctrlKey || event.metaKey)) { event.preventDefault(); if (!blocked) onSend() } }}/>
    <div className="solver-compose-actions">
      {onImport && <button className="solver-attach" onClick={() => inputRef.current?.click()} disabled={blocked || (images?.length ?? 0) >= imageLimits.maxImages} aria-label="Adjuntar imágenes"><Icon name="paperclip"/><span>{imageBusy ? 'Preparando…' : 'Adjuntar imágenes'}</span></button>}
      {onDeepChange && <label className="deep-toggle"><input type="checkbox" checked={deep} onChange={event => onDeepChange(event.target.checked)} disabled={blocked}/><span/><b>Razonamiento reforzado</b></label>}
      <button className="solver-send" onClick={onSend} disabled={blocked || (!value.trim() && !images?.length)} aria-label={sendLabel} title={sendLabel}>{busy ? '···' : '↑'}</button>
    </div>
  </div>
}

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { DocumentReader, type ReaderProps } from './DocumentReader'
import { sourceLimits } from '../lib/sourceModel'

export function NoteReader({ onSave, ...props }: ReaderProps & { onSave: (title: string, body: string) => Promise<void> }) {
  const { user } = useAuth(), key = `nexo-note-draft:${user?.id}:${props.material.id}`
  const savedDraft = useRef<{ title: string; body: string; revision: number } | undefined>(undefined)
  if (savedDraft.current === undefined) { try { const value = JSON.parse(localStorage.getItem(key) ?? 'null'); if (value && typeof value.title === 'string' && typeof value.body === 'string' && value.body.length <= sourceLimits.textChars) savedDraft.current = value } catch { /* Draft storage is optional. */ } }
  const [title,setTitle] = useState(savedDraft.current?.title ?? props.material.title), [body,setBody] = useState(savedDraft.current?.body ?? props.material.text)
  const [editing,setEditing] = useState(Boolean(savedDraft.current)), [dirty,setDirty] = useState(Boolean(savedDraft.current))
  const [status,setStatus] = useState(''), [error,setError] = useState(''), [retry,setRetry] = useState(0)
  const [conflict,setConflict] = useState(Boolean(savedDraft.current && savedDraft.current.revision !== (props.material.sourceRevision ?? 0)))
  const latest = useRef({ title,body,dirty }), busy = useRef(false), mounted = useRef(true), callback = useRef(onSave)
  callback.current = onSave; latest.current = { title,body,dirty }
  const save = async () => {
    if (busy.current || !latest.current.dirty || conflict) return
    const snapshot = latest.current
    if (!snapshot.title.trim() || !snapshot.body.trim()) { setError('El apunte necesita título y contenido.'); return }
    busy.current = true; setStatus('Guardando…'); setError('')
    try {
      await callback.current(snapshot.title,snapshot.body)
      if (mounted.current) {
        if (latest.current.title === snapshot.title && latest.current.body === snapshot.body) { setDirty(false); setStatus('Guardado'); try { localStorage.removeItem(key) } catch { /* Server save is already complete. */ } }
        else setRetry(value => value+1)
      }
    } catch (cause) { if (mounted.current) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar. Tu borrador permanece aquí.'); setStatus('Sin guardar') } }
    finally { busy.current = false }
  }
  useEffect(() => {
    if (!dirty) return
    try { localStorage.setItem(key,JSON.stringify({ title,body,revision: props.material.sourceRevision ?? 0 })) } catch { setError('No pudimos conservar el borrador local. Guarda antes de salir.') }
    if (conflict) return
    const timer = window.setTimeout(() => void save(),800)
    return () => clearTimeout(timer)
  },[title,body,dirty,retry,conflict])
  useEffect(() => { mounted.current=true; return () => { mounted.current=false; if (latest.current.dirty && !busy.current && !conflict) void save() } },[])
  return <div className="note-reader"><div className="reader-note-tools"><button className="secondary" onClick={() => setEditing(value => !value)}>{editing ? 'Leer apunte' : 'Editar apunte'}</button><span role="status" aria-live="polite">{status || (dirty ? 'Cambios pendientes' : 'Guardado')}</span></div>
    {conflict && <div role="alert" className="reader-note-conflict"><p>El apunte cambió desde que se guardó este borrador. Revisa el contenido antes de reemplazarlo.</p><button className="secondary" onClick={() => { setConflict(false); setRetry(value => value+1) }}>Guardar este borrador</button><button className="text-button" onClick={() => { setTitle(props.material.title); setBody(props.material.text); setDirty(false); setConflict(false); try { localStorage.removeItem(key) } catch { /* Server save is already complete. */ } }}>Usar versión guardada</button></div>}
    {editing ? <div className="note-editor"><label>Título del apunte<input maxLength={180} value={title} onChange={event => { setTitle(event.target.value); setDirty(true) }}/></label><label>Contenido del apunte<textarea rows={14} maxLength={sourceLimits.textChars} value={body} onChange={event => { setBody(event.target.value); setDirty(true) }}/></label><p className="utility-note">Puedes usar encabezados Markdown (#). Los cambios actualizan el contexto de Nexo; los recursos anteriores necesitarán regenerarse.</p></div> : <DocumentReader {...props}/>}
    {error && <div role="alert"><p>{error}</p><button className="secondary" onClick={() => void save()}>Reintentar guardado</button></div>}
  </div>
}

import { useId, useState } from 'react'
import type { Course, SourceType } from './types'
import type { SourceInput } from './lib/sourceProcessing'
import { Dialog } from './Dialog'
import { parseYouTubeUrl, sourceAccept, sourceLimits, validateSourceFile } from './lib/sourceModel'
import { suggestMaterialTitle } from './lib/materialTitles'

export type SourceChoice = 'upload' | 'paste' | 'youtube' | 'note'
const choices: { id: SourceChoice; label: string; detail: string; icon: string }[] = [
  { id: 'upload', label: 'Subir', detail: 'Archivo, imagen o documento', icon: '↑' },
  { id: 'paste', label: 'Pegar', detail: 'Texto o enlace', icon: '↳' },
  { id: 'youtube', label: 'YouTube', detail: 'Video o clase', icon: '▷' },
  { id: 'note', label: 'Apuntes', detail: 'Escribir manualmente', icon: '✎' },
]
export function AddSourceDialog({ courses, initialCourseId = '', initialChoice, initialText = '', onClose, onCreateCourse, onCreate }: {
  courses: Course[]; initialCourseId?: string; initialChoice?: SourceChoice; initialText?: string; onClose: () => void;
  onCreateCourse: (name: string) => Promise<Course>; onCreate: (input: SourceInput) => Promise<void>
}) {
  const id = useId()
  const [choice,setChoice] = useState<SourceChoice | undefined>(initialChoice)
  const [courseId,setCourseId] = useState(initialCourseId)
  const [created,setCreated] = useState<Course[]>([])
  const [newCourse,setNewCourse] = useState(false), [courseName,setCourseName] = useState('')
  const [title,setTitle] = useState(initialText ? initialText.split('\n').find(line => line.trim())?.replace(/^[#*]+\s*/,'').slice(0,100) ?? '' : '')
  const [text,setText] = useState(initialText), [url,setUrl] = useState(''), [file,setFile] = useState<File>()
  const [type,setType] = useState<SourceType>('text'), [pasteUrl,setPasteUrl] = useState(false)
  const [busy,setBusy] = useState(false), [error,setError] = useState('')
  const [titleEdited,setTitleEdited] = useState(false)
  const allCourses = [...new Map([...courses,...created].map(course => [course.id,course])).values()]
  const chooseFile = async (candidate?: File) => {
    if (!candidate || busy) return
    setError(''); setBusy(true)
    try { const spec = await validateSourceFile(candidate); setFile(candidate); setType(spec.sourceType); setTitle(suggestMaterialTitle(candidate.name)) }
    catch (cause) { setFile(undefined); setError(cause instanceof Error ? cause.message : 'No pudimos leer este archivo.') }
    finally { setBusy(false) }
  }
  const submit = async () => {
    if (busy) return
    setError('')
    if (!courseId && !newCourse) { setError('Selecciona el curso donde guardarás este material.'); return }
    const sourceType = choice === 'upload' ? type : choice === 'note' ? 'note' : choice === 'youtube' ? 'youtube' : pasteUrl ? 'web' : 'text'
    if (choice === 'upload' && !file) { setError('Elige un archivo para continuar.'); return }
    if (sourceType === 'youtube') { try { parseYouTubeUrl(url) } catch (cause) { setError((cause as Error).message); return } }
    if (sourceType === 'web') { try { const parsed = new URL(url); if (!['http:','https:'].includes(parsed.protocol)) throw new Error() } catch { setError('Pega un enlace HTTP o HTTPS válido.'); return } }
    if (['note','text'].includes(sourceType) && (!text.trim() || text.length > sourceLimits.textChars) && !file) { setError('Escribe contenido de hasta 300 000 caracteres.'); return }
    if (!title.trim() && !['web','youtube'].includes(sourceType)) { setError('Escribe un título para el material.'); return }
    setBusy(true)
    try {
      let destination = courseId
      if (newCourse) {
        if (!courseName.trim()) throw new Error('Escribe el nombre del nuevo curso.')
        const course = await onCreateCourse(courseName)
        setCreated(current => [...current,course]); setCourseId(course.id); setNewCourse(false); destination = course.id
      }
      await onCreate({ courseId: destination, title: title.trim(), sourceType, file: choice === 'upload' ? file : undefined, text, url: url.trim() })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar el material. Conservamos tu contenido para reintentar.') }
    finally { setBusy(false) }
  }
  return <Dialog title="Agregar material" onClose={onClose} className="source-dialog">
    <div className="modal-head"><h2>Agregar material</h2><button aria-label="Cerrar diálogo" onClick={onClose}>×</button></div>
    {!choice ? <><p className="source-question">¿Qué quieres estudiar?</p><div className="source-choices">{choices.map(item => <button key={item.id} onClick={() => { setChoice(item.id); setError('') }}><span aria-hidden="true">{item.icon}</span><strong>{item.label}</strong><small>{item.detail}</small></button>)}</div><p className="utility-note">PDF · DOCX · PPTX · TXT · Markdown · PNG · JPG · WEBP</p></> : <>
      <button className="text-button" onClick={() => { setChoice(undefined); setError('') }}>← Cambiar fuente</button>
      <h3>{choices.find(item => item.id === choice)?.label}</h3>
      {choice === 'upload' && <div className="source-upload" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void chooseFile(event.dataTransfer.files[0]) }}>
        <label htmlFor={`${id}-file`}>Elige un archivo o arrástralo aquí</label><input id={`${id}-file`} aria-describedby={`${id}-limits ${id}-error`} type="file" disabled={busy} accept={sourceAccept} onChange={event => void chooseFile(event.target.files?.[0])}/>
        <p id={`${id}-limits`} className="utility-note">PDF hasta 25 MB · Office 20 MB · imágenes 10 MB · texto 1 MB</p>
        {file && <p>{file.name}</p>}{type === 'image' && file && <p className="utility-note">Al guardar, Nexo leerá el contenido visible de la imagen. El original se guarda privado.</p>}
      </div>}
      {choice === 'paste' && <div className="source-paste-mode" role="group" aria-label="Tipo de contenido"><button className="secondary" aria-pressed={!pasteUrl} onClick={() => setPasteUrl(false)}>Texto</button><button className="secondary" aria-pressed={pasteUrl} onClick={() => setPasteUrl(true)}>Enlace</button></div>}
      {(choice === 'youtube' || choice === 'paste' && pasteUrl) && <label htmlFor={`${id}-url`}>{choice === 'youtube' ? 'URL de YouTube' : 'Enlace web'}<input id={`${id}-url`} type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder={choice === 'youtube' ? 'https://www.youtube.com/watch?v=…' : 'https://…'} aria-describedby={`${id}-error`} maxLength={2048}/></label>}
      {choice === 'youtube' && <p className="utility-note">Si no hay transcripción accesible, podrás pegarla manualmente desde el material.</p>}
      {(choice === 'note' || choice === 'paste' && !pasteUrl) && <label htmlFor={`${id}-body`}>{choice === 'note' ? 'Tus apuntes' : 'Contenido'}<textarea id={`${id}-body`} rows={6} maxLength={sourceLimits.textChars} value={text} onChange={event => { setText(event.target.value); if (!titleEdited) setTitle(event.target.value.split('\n').find(line => line.trim())?.replace(/^#+\s*/,'').slice(0,100) ?? '') }} aria-describedby={`${id}-error`} placeholder="Escribe o pega lo que quieres estudiar…"/></label>}
      <label htmlFor={`${id}-title`}>Título{(choice === 'youtube' || choice === 'paste' && pasteUrl) ? ' (opcional)' : ''}<input id={`${id}-title`} value={title} maxLength={180} onChange={event => { setTitleEdited(true); setTitle(event.target.value) }} aria-describedby={`${id}-error`}/></label>
      <div className="source-destination"><strong>Guardar en</strong>{newCourse ? <label htmlFor={`${id}-new`}>Nombre del nuevo curso<input id={`${id}-new`} value={courseName} maxLength={180} onChange={event => setCourseName(event.target.value)} aria-describedby={`${id}-error`}/></label> : <label htmlFor={`${id}-course`}>Curso<select id={`${id}-course`} value={courseId} onChange={event => setCourseId(event.target.value)} aria-describedby={`${id}-error`}><option value="">Selecciona un curso</option>{allCourses.map(course => <option key={course.id} value={course.id}>{course.emoji} {course.name}</option>)}</select></label>}
        <button className="text-button" onClick={() => setNewCourse(value => !value)}>{newCourse ? 'Elegir un curso existente' : '+ Crear nuevo curso'}</button>
      </div>
      <div className="modal-actions"><button className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy || (!courseId && !newCourse)} onClick={() => void submit()}>{busy ? 'Guardando…' : 'Guardar y abrir material'}</button></div>
    </>}
    <p id={`${id}-error`} role={error ? 'alert' : 'status'} aria-live="polite" className={error ? 'auth-alert error' : 'utility-note'}>{error || (busy ? 'Preparando la fuente…' : '')}</p>
  </Dialog>
}

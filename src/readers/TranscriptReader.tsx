import { useState } from 'react'
import { DocumentReader, type ReaderProps } from './DocumentReader'
import { parseYouTubeUrl, sourceLimits, timestampLabel } from '../lib/sourceModel'

export function TranscriptReader({ onTranscript, ...props }: ReaderProps & { onTranscript: (text: string) => void }) {
  const [editing,setEditing] = useState(!props.material.text.trim()), [text,setText] = useState('')
  let sourceUrl = ''
  try { sourceUrl = parseYouTubeUrl(props.material.sourceMetadata?.sourceUrl ?? '').sourceUrl } catch { /* Never embed an arbitrary URL. */ }
  const selected = props.material.pages?.find(item => item.page === props.unit)
  return <div className="transcript-reader">
    <div className="reader-origin">{sourceUrl && <a href={`${sourceUrl}${selected?.timestamp !== undefined ? `&t=${Math.floor(selected.timestamp)}s` : ''}`} target="_blank" rel="noopener noreferrer">{selected?.timestamp !== undefined ? `Ver video en ${timestampLabel(selected.timestamp)}` : 'Abrir video original'} ↗</a>}{props.material.sourceMetadata?.author && <span>{props.material.sourceMetadata.author}</span>}</div>
    {!props.material.text.trim() && <p className="utility-note">No encontramos una transcripción disponible.</p>}
    {editing ? <div className="transcript-paste"><label>Transcripción manual<textarea rows={8} value={text} maxLength={sourceLimits.textChars} onChange={event => setText(event.target.value)} placeholder={'03:14 Ley de Coulomb…\n12:42 Componentes de velocidad…'}/></label><p className="utility-note">Puedes incluir minutos y segundos al inicio de cada segmento. Hasta 300 000 caracteres.</p><button className="primary" disabled={!text.trim() || props.material.processingStatus === 'processing'} onClick={() => { onTranscript(text); setEditing(false) }}>Guardar transcripción</button>{props.material.text && <button className="text-button" onClick={() => setEditing(false)}>Cancelar</button>}</div> : <>
      <DocumentReader {...props}/><button className="text-button reader-edit-transcript" onClick={() => setEditing(true)}>Pegar transcripción manualmente</button>
    </>}
  </div>
}

import { lazy, Suspense, useState } from 'react'
import type { Material } from './types'
import type { ReaderProps } from './readers/DocumentReader'
import { sourceAccept } from './lib/sourceModel'
const DocumentReader = lazy(() => import('./readers/DocumentReader').then(m => ({ default: m.DocumentReader })))
const SlideReader = lazy(() => import('./readers/SlideReader').then(m => ({ default: m.SlideReader })))
const TranscriptReader = lazy(() => import('./readers/TranscriptReader').then(m => ({ default: m.TranscriptReader })))
const ArticleReader = lazy(() => import('./readers/ArticleReader').then(m => ({ default: m.ArticleReader })))
const ImageStudyView = lazy(() => import('./readers/ImageStudyView').then(m => ({ default: m.ImageStudyView })))
const NoteReader = lazy(() => import('./readers/NoteReader').then(m => ({ default: m.NoteReader })))

export function SourceReader({ onRetry, onSave, ...props }: ReaderProps & { onRetry: (file?: File, transcript?: string) => void; onSave: (title: string, text: string) => Promise<void> }) {
  const [replacement,setReplacement] = useState<File>()
  const material = props.material
  const working = material.processingStatus === 'processing' || material.processingStatus === 'queued'
  const failed = material.processingStatus === 'failed'
  return <div className="universal-reader">
    {(working || failed || material.processingError) && <div className="source-processing" role={failed ? 'alert' : 'status'} aria-live="polite"><strong>{working ? material.storagePath ? 'Preparando contenido…' : material.sourceName ? 'Subiendo original privado…' : 'Preparando contenido…' : failed ? 'No pudimos preparar esta fuente.' : 'Preparación parcial'}</strong><p>{working ? 'Puedes continuar navegando. El material permanecerá en este curso.' : material.processingError}</p>{failed && <><button className="secondary" onClick={() => onRetry(replacement)}>Reintentar</button>{material.sourceName && <label>Volver a elegir el original<input type="file" accept={sourceAccept} onChange={event => setReplacement(event.target.files?.[0])}/></label>}</>}</div>}
    {!working && !failed && <Suspense fallback={<p role="status" className="reader-loading">Abriendo contenido…</p>}>
      {material.sourceType === 'pptx' ? <SlideReader {...props}/> : material.sourceType === 'youtube' ? <TranscriptReader {...props} onTranscript={text => onRetry(undefined,text)}/> : material.sourceType === 'web' ? <ArticleReader {...props}/> : material.sourceType === 'image' ? <ImageStudyView {...props}/> : material.sourceType === 'note' ? <NoteReader {...props} onSave={onSave}/> : <DocumentReader {...props}/>}
    </Suspense>}
  </div>
}
export function sourceIsReady(material: Material) { return (material.processingStatus === undefined || material.processingStatus === 'ready') && Boolean(material.text.trim() || material.chunks?.length) }

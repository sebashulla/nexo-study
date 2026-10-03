import type { Material, MaterialPage } from '../types'
import { sourceReference } from '../lib/sourceModel'

export type ReaderProps = { material: Material; unit: number; onUnit: (unit: number) => void; onAsk: (unit: number) => void }
export function DocumentReader({ material, unit, onUnit, onAsk }: ReaderProps) {
  const sections: MaterialPage[] = material.pages?.length ? material.pages : [{ page: 1, text: material.text }]
  const index = Math.max(0,sections.findIndex(section => section.page === unit)), section = sections[index]
  return <div className="source-reader document-reader">
    {sections.length > 1 && <details className="reader-index"><summary>Índice · {sections.length} secciones</summary><nav aria-label="Índice del documento">{sections.map(item => <button key={item.page} aria-current={item.page === section.page ? 'page' : undefined} onClick={() => onUnit(item.page)}>{item.heading || `Sección ${item.page}`}</button>)}</nav></details>}
    <article key={section.page} className="reader-body"><p className="eyebrow">{sourceReference(material,section.page)}</p>
      {section.heading && <h3>{section.heading}</h3>}
      {section.blocks?.length ? section.blocks.filter(block => block.kind !== 'heading' || block.text !== section.heading).map((block,index) => block.kind === 'heading' ? <h4 key={index}>{block.text}</h4> : block.kind === 'list' ? <ul key={index}><li>{block.text}</li></ul> : <p key={index} className={block.kind === 'table' ? 'reader-table' : block.kind === 'notes' ? 'reader-speaker-notes' : undefined}>{block.text}</p>)
        : section.text.split(/\n\s*\n/).map((text,index) => <p key={index}>{text}</p>)}
      {!section.text && <p className="utility-note">Esta unidad no contiene texto extraíble.</p>}
    </article>
    <div className="reader-actions"><button className="secondary" disabled={!section.text.trim()} onClick={() => onAsk(section.page)}>Preguntar a Nexo sobre esta sección</button></div>
    {sections.length > 1 && <nav className="reader-pagination" aria-label="Recorrer secciones"><button className="secondary" disabled={index === 0} onClick={() => onUnit(sections[index-1].page)}>← Anterior</button><span>{index+1} / {sections.length}</span><button className="secondary" disabled={index === sections.length-1} onClick={() => onUnit(sections[index+1].page)}>Siguiente →</button></nav>}
  </div>
}

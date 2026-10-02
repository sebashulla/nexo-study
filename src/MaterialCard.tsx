import type { Material } from './types'
import { displayMaterialTitle } from './lib/materialTitles'
import { PopupMenu } from './PopupMenu'

export function MaterialCard({ material, onOpen, onRename, onDownload }: { material: Material; onOpen: () => void; onRename: () => void; onDownload?: () => void }) {
  return <article className="material-card-frame"><button className="material-card" onClick={onOpen}><div className="material-meta"><span className="file-icon">{material.sourceType === 'pdf' ? 'PDF' : 'TXT'}</span><small>{material.sourceType === 'pdf' ? `${material.pageCount ?? '…'} páginas` : 'Apuntes'}</small></div><h3>{displayMaterialTitle(material.title)}</h3><p>{material.analysisStatus === 'partial' ? `${material.analyzedPages?.length ?? 0} páginas preparadas` : material.processingStatus === 'failed' ? 'Preparación pendiente · abre para reintentar' : 'Material y Nexo en un mismo espacio'}</p><div className="material-footer"><span>Abrir material</span><b>→</b></div></button>
    <PopupMenu className="material-card-menu" label={`Opciones de ${material.title}`} trigger="···" triggerClass="context-menu-trigger" menuLabel={`Acciones de ${material.title}`}><button role="menuitem" onClick={onRename}>Renombrar</button>{onDownload && <button role="menuitem" onClick={onDownload}>Descargar original</button>}</PopupMenu>
  </article>
}

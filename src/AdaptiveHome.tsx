import type { Course, Material } from './types'
import type { StudyActivity } from './lib/studyProgress'
import { materialProgress, studyPackFor } from './lib/studyProgress'
import type { TodayAction } from './lib/productIntelligence'

export function AdaptiveHome({ name, recent, activity, actions, onContinue, onAction, onSession, onUpload }: {
  name: string; recent: { course: Course; material: Material }; activity: StudyActivity; actions: TodayAction[]
  onContinue: () => void; onAction: (action: TodayAction) => void; onSession: () => void; onUpload: () => void
}) {
  const { course, material } = recent
  const last = activity[material.id]?.lastStudiedAt
  return <div className="home-today"><div className="section-head"><h2>Bienvenido de nuevo{name ? `, ${name.split(' ')[0]}` : ''}</h2><button className="secondary" onClick={onUpload}>＋ Subir material</button></div>
    <section className="home-continue"><div><p className="eyebrow">Continuar estudiando · {course.emoji} {course.name}</p><h3>{material.title}</h3><p>{material.sourceType === 'pdf' ? `${material.pageCount ?? '…'} páginas · ${material.analysisStatus === 'partial' ? `${material.analyzedPages?.length ?? 0} preparadas` : material.analysisStatus === 'ready' ? 'Preparado' : 'Preparación pendiente'}` : 'Apuntes'} · {materialProgress(studyPackFor(material), activity[material.id], material)}% de actividad{last ? ` · Última actividad: ${new Date(last).toLocaleDateString('es-PE')}` : ''}</p></div><button className="primary" onClick={onContinue}>Continuar →</button></section>
    <section className="home-today-plan"><p className="eyebrow">Hoy</p><div className="home-today-actions">{actions.map(action => <button className="secondary" key={action.id} onClick={() => onAction(action)}>{action.text} →</button>)}</div><button className="text-button" onClick={onSession}>Comenzar sesión de 15 min →</button></section>
  </div>
}

import { sourceDescription } from './lib/sourceModel'
import type { Course, Material } from './types'
import type { StudyActivity } from './lib/studyProgress'
import { materialProgress, studyPackFor } from './lib/studyProgress'
import type { TodayAction } from './lib/productIntelligence'

export function AdaptiveHome({ name, recent, activity, actions, mobile, onContinue, onAction, onSession, onUpload }: {
  mobile: boolean; name: string; recent: { course: Course; material: Material }; activity: StudyActivity; actions: TodayAction[]
  onContinue: () => void; onAction: (action: TodayAction) => void; onSession: () => void; onUpload: () => void
}) {
  const { course, material } = recent
  const last = activity[material.id]?.lastStudiedAt
  const hour = new Date().getHours()
  return <div className="home-today"><div className="section-head"><h2>{hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'}{name ? `, ${name.split(' ')[0]}` : ''} 👋</h2><button className="secondary" onClick={onUpload}>＋ Agregar material</button></div>
    <section className="home-continue"><div><p className="eyebrow">Continuar estudiando · {course.emoji} {course.name}</p><h3>{material.title}</h3><p>{sourceDescription(material)} · {materialProgress(studyPackFor(material), activity[material.id], material)}% de actividad{last ? ` · Última actividad: ${new Date(last).toLocaleDateString('es-PE')}` : ''}</p></div><button className="primary" onClick={onContinue}>Continuar →</button></section>
    <section className="home-today-plan"><p className="eyebrow">Siguiente paso</p><div className="home-today-actions">{actions.slice(0, 1).map(action => <button className="secondary" key={action.id} onClick={() => onAction(action)}>{action.text} →</button>)}</div><button className="text-button" onClick={onSession}>Preparar sesión de 15 min →</button>{actions.length > 1 && <details><summary>Más sugerencias</summary><div className="home-today-actions">{actions.slice(1).map(action => <button className="text-button" key={action.id} onClick={() => onAction(action)}>{action.text} →</button>)}</div></details>}</section>
  </div>
}

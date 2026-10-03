import type { Course, StudySession } from './types'
import type { LearningMemory } from './lib/learningState'
import type { StudyActivity } from './lib/studyProgress'
import { workspaceProgress } from './lib/studyProgress'
import { masterySummary } from './lib/learningState'
import { courseRecommendations, recentMaterial, weakConceptsFor, type CourseRecommendation } from './lib/productIntelligence'
import { displayMaterialTitle } from './lib/materialTitles'
import type { ReactNode } from 'react'
import { sourceDescription } from './lib/sourceModel'

export function CourseOverview({ course: originalCourse, activity, memory, sessions, onOpenMaterial, onUpload, onRecommend, onCourseAi, children }: {
  children: ReactNode
  course: Course
  activity: StudyActivity
  memory: LearningMemory
  sessions: StudySession[]
  onOpenMaterial: (materialId: string) => void
  onUpload: () => void
  onRecommend: (recommendation: CourseRecommendation) => void
  onCourseAi: () => void
}) {
  const course = { ...originalCourse, materials: originalCourse.materials.filter(material => !material.archivedAt && !material.deletionPending) }
  const recent = recentMaterial(course, activity)
  const recommendations = courseRecommendations(course, activity, memory, sessions).filter(item => item.action !== 'continue')
  const practiced = course.materials.filter(material => Object.keys(activity[material.id]?.answers ?? {}).length || Object.keys(activity[material.id]?.practiceAttempts ?? {}).length || activity[material.id]?.flashcardsSeen?.length).sort((a,b) => (activity[b.id]?.lastStudiedAt ?? '').localeCompare(activity[a.id]?.lastStudiedAt ?? '')).slice(0,3)
  const weak = weakConceptsFor(course, memory, 5)
  const activityPercent = workspaceProgress([course], activity).percent
  const mastery = masterySummary(memory, course.materials.map(material => material.id))
  return <div className="course-home-v2">
    <section className="course-overview">
      <div className="course-overview-main"><p className="eyebrow">Continuar estudiando</p>
        <h3>{recent ? displayMaterialTitle(recent.title) : 'Tu primer material'}</h3>
        <p>{recent ? `${sourceDescription(recent)}${activity[recent.id]?.lastStudiedAt ? ` · Última actividad ${new Date(activity[recent.id].lastStudiedAt!).toLocaleDateString('es-PE')}` : ''}` : 'Agrega un archivo, texto, enlace o apunte para empezar.'}</p>
        <button className="primary" onClick={() => recent ? onOpenMaterial(recent.id) : onUpload()}>{recent ? 'Continuar →' : 'Agregar material'}</button>
      </div>
      <div className="course-overview-side"><strong>{activityPercent}% de actividad</strong>
        <p>{mastery.sufficient ? `${mastery.percent}% de dominio estimado · ${weak.length} conceptos por repasar` : 'Dominio: sin datos suficientes. Practica para estimarlo.'}</p>
        <button className="text-button" onClick={onCourseAi}>Preguntar a Nexo →</button>
      </div>
    </section>
    {children}
    {practiced.length > 0 && <section className="course-home-section"><h3>Práctica reciente</h3><div className="course-recommendations">{practiced.map(material => <button className="secondary" key={material.id} onClick={() => onOpenMaterial(material.id)}><span>{displayMaterialTitle(material.title)}</span><strong>Retomar práctica →</strong></button>)}</div></section>}
    {recommendations.length > 0 && <section className="course-home-section"><div className="section-head"><div><p className="eyebrow">Siguiente acción</p><h3>Nexo recomienda</h3></div></div>
      <div className="course-recommendations">{recommendations.map(item => <button key={item.id} className="secondary" onClick={() => onRecommend(item)}><span>{item.text}</span><strong>{item.action === 'analyze' ? 'Preparar más →' : item.action === 'practice' ? 'Practicar →' : item.action === 'review' ? 'Repasar →' : item.action === 'session' ? 'Continuar sesión →' : 'Continuar →'}</strong></button>)}</div>
    </section>}
    {weak.length > 0 && <section className="course-home-section course-weak-topics"><p className="eyebrow">Temas por reforzar</p><div>{weak.map(concept => <button className="secondary" key={concept.key} onClick={() => onOpenMaterial(concept.materialId)}>{concept.label} →</button>)}</div></section>}
  </div>
}

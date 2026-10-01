import { useEffect, useState } from 'react'
import type { Course } from './types'
import { searchAcademicTopics } from './lib/learningRepository'
import { displayMaterialTitle } from './lib/materialTitles'
import { Dialog } from './Dialog'

type TopicHit = { courseId: string; materialId: string; title: string; page: number }

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function GlobalSearch({ userId, courses, onClose, onCourse, onMaterial, onUpload, onResolver }: {
  userId: string
  courses: Course[]
  onClose: () => void
  onCourse: (courseId: string) => void
  onMaterial: (courseId: string, materialId: string, page?: number) => void
  onUpload: () => void
  onResolver: () => void
}) {
  const [query, setQuery] = useState('')
  const [remoteTopics, setRemoteTopics] = useState<TopicHit[]>([])
  useEffect(() => {
    if (query.trim().length < 2) return
    let live = true
    const timer = window.setTimeout(() => {
      void searchAcademicTopics(userId, query).then(result => { if (live) setRemoteTopics(result) }).catch(() => { if (live) setRemoteTopics([]) })
    }, 250)
    return () => { live = false; window.clearTimeout(timer) }
  }, [query, userId])
  const term = normalized(query.trim())
  const courseHits = term ? courses.filter(course => normalized(course.name).includes(term)).slice(0, 6) : []
  const materialHits = term ? courses.flatMap(course => course.materials.filter(material =>
    normalized(`${material.title} ${material.sourceName ?? ''}`).includes(term)).map(material => ({ course, material }))).slice(0, 10) : []
  const topicHits = term ? [...courses.flatMap(course => course.materials.flatMap(material =>
    (material.topics ?? []).filter(topic => normalized(topic.title).includes(term)).map(topic => ({
      courseId: course.id, materialId: material.id, title: topic.title, page: topic.pageStart ?? 1,
    })))), ...remoteTopics.filter(topic => normalized(topic.title).includes(term))]
    .filter((hit, index, all) => all.findIndex(item => item.materialId === hit.materialId && item.page === hit.page && item.title === hit.title) === index).slice(0, 15) : []
  return <Dialog title="Buscar en Nexo Study" onClose={onClose} className="global-search-dialog">
    <div className="global-search"><label>Buscar cursos, materiales y temas<input autoFocus aria-label="Buscar en Nexo Study" value={query} onChange={event => setQuery(event.target.value)} placeholder="Escribe un tema, curso o material…" /></label>
      <div className="global-search-results">
        {!term && <><p className="eyebrow">Acciones rápidas</p><button onClick={onUpload}>＋ Subir material</button><button onClick={onResolver}>✦ Resolver rápido</button></>}
        {courseHits.map(course => <button key={course.id} onClick={() => onCourse(course.id)}><span>Curso</span><strong>{course.emoji} {course.name}</strong></button>)}
        {materialHits.map(({ course, material }) => <button key={material.id} onClick={() => onMaterial(course.id, material.id)}><span>{course.name} · Material</span><strong>{displayMaterialTitle(material.title)}</strong></button>)}
        {topicHits.map(topic => {
          const course = courses.find(item => item.id === topic.courseId)
          const material = course?.materials.find(item => item.id === topic.materialId)
          if (!course || !material) return null
          return <button key={`${topic.materialId}:${topic.page}:${topic.title}`} onClick={() => onMaterial(course.id, material.id, topic.page)}><span>{course.name} · {displayMaterialTitle(material.title)} · pág. {topic.page}</span><strong>{topic.title}</strong></button>
        })}
        {term && !courseHits.length && !materialHits.length && !topicHits.length && <p>No encontramos coincidencias. Prueba con otra palabra.</p>}
      </div>
    </div>
  </Dialog>
}

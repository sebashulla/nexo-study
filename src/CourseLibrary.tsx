import { useState } from 'react'
import type { Course, SavedSolution, StudyArtifact } from './types'
import { artifactPage } from './lib/artifactPrompts'
import { artifactConcept } from './lib/artifactScope'
import { EmptyState } from './EmptyState'

const filters = ['Todo', 'Materiales', 'Apuntes', 'Flashcards', 'Práctica', 'Exámenes', 'Soluciones'] as const
const labels = { summary: 'Resumen', flashcards: 'Flashcards', multiple_choice: 'Opción múltiple', written_questions: 'Preguntas escritas', fill_blanks: 'Completar espacios', notes: 'Apuntes', exam: 'Simulacro' }

export function CourseLibrary({ course, solutions, loading, error, onRetry, onMaterial, onArtifact, onSolution }: {
  course: Course; solutions: SavedSolution[]; loading: boolean; error: string; onRetry: () => void
  onMaterial: (materialId: string) => void; onArtifact: (materialId: string, artifact: StudyArtifact) => void; onSolution: (solution: SavedSolution) => void
}) {
  const [filter, setFilter] = useState<typeof filters[number]>('Todo')
  const artifacts = course.materials.flatMap(material => (material.artifacts ?? [])
    .filter(item => item.status === 'ready' && !(material.artifacts ?? []).some(other => other.status === 'ready' && other.type === item.type && artifactPage(other) === artifactPage(item) && artifactConcept(other) === artifactConcept(item) && other.version > item.version))
    .map(artifact => ({ material, artifact })))
  const selected = artifacts.filter(({ artifact }) => filter === 'Todo' ||
    filter === 'Apuntes' && ['notes', 'summary'].includes(artifact.type) || filter === 'Flashcards' && artifact.type === 'flashcards' ||
    filter === 'Práctica' && ['multiple_choice', 'fill_blanks'].includes(artifact.type) || filter === 'Exámenes' && ['exam', 'written_questions'].includes(artifact.type))
  const showMaterials = filter === 'Todo' || filter === 'Materiales'
  const showSolutions = filter === 'Todo' || filter === 'Soluciones'
  const empty = !selected.length && !(showMaterials && course.materials.length) && !(showSolutions && solutions.length)
  return <div className="course-artifact-library"><h3>Biblioteca del curso</h3>
    <div className="library-filters" role="group" aria-label="Filtrar biblioteca">{filters.map(item => <button className="secondary" key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div>
    {error && <p role="status">{error} <button className="text-button" onClick={onRetry}>Reintentar</button></p>}
    {showMaterials && course.materials.map(material => <button className="library-entry secondary" key={material.id} onClick={() => onMaterial(material.id)}><strong>{material.title}</strong><span>Material · {material.sourceType === 'pdf' ? `${material.pageCount ?? '…'} páginas` : 'Apuntes originales'}</span></button>)}
    {selected.map(({ material, artifact }) => <button className="library-entry secondary" key={artifact.id} onClick={() => onArtifact(material.id, artifact)}><strong>{artifactConcept(artifact) ? `Práctica · ${artifactConcept(artifact)}` : labels[artifact.type]}</strong><span>{material.title}{artifactPage(artifact) ? ` · Página ${artifactPage(artifact)}` : ''}</span></button>)}
    {showSolutions && solutions.map(solution => <button className="library-entry secondary" key={solution.id} onClick={() => onSolution(solution)}><strong>{solution.question}</strong><span>Solución · {solution.category} · {solution.attachments.length} imágenes · {new Date(solution.createdAt).toLocaleDateString('es-PE')}</span></button>)}
    {loading && <p role="status">Cargando soluciones…</p>}
    {!loading && empty && <EmptyState title="Aún no hay recursos en este filtro" text="Guarda soluciones desde Resolver o prepara métodos desde un material para encontrarlos aquí."/>}
  </div>
}

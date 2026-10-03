import type { StudyArtifact } from '../types'

export function artifactConcept(artifact: StudyArtifact): string | undefined {
  const payload = artifact.payload as { scope?: { kind?: string; label?: string } } | null
  return payload?.scope?.kind === 'concept' && typeof payload.scope.label === 'string' ? payload.scope.label : undefined
}
export const focusedArtifact = (artifact: StudyArtifact) => !!artifactPage(artifact) || !!artifactConcept(artifact)

export function artifactPage(artifact: StudyArtifact): number | undefined {
  const payload = artifact.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('scope' in payload)) return undefined
  const scope = payload.scope
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) || !('page' in scope)) return undefined
  const value = Number(scope.page)
  return Number.isInteger(value) && value > 0 ? value : undefined
}

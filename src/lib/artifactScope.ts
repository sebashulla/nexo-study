import type { StudyArtifact } from '../types'

export function artifactPage(artifact: StudyArtifact): number | undefined {
  const payload = artifact.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('scope' in payload)) return undefined
  const scope = payload.scope
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) || !('page' in scope)) return undefined
  const value = Number(scope.page)
  return Number.isInteger(value) && value > 0 ? value : undefined
}

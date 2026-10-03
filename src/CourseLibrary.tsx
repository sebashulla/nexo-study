import type { Course, SavedSolution, StudyArtifact } from './types'
import { LibraryV2 } from './LibraryV2'
import { useAuth } from './auth/AuthContext'
import type { ConversationThread } from './lib/conversationTypes'
export function CourseLibrary({ course, solutions, loading, error, onRetry, onMaterial, onSolution, onArtifact, onAdd, onConversation, workspaceId }: {
  course: Course; solutions: SavedSolution[]; loading: boolean; error: string; onRetry: () => void; onMaterial: (id: string, page?: number) => void;
  onSolution: (solution: SavedSolution) => void; onArtifact: (materialId: string,artifact: StudyArtifact) => void;
  onAdd: () => void; onConversation: (thread: ConversationThread) => void; workspaceId: string
}) {
  const { user } = useAuth()
  return <LibraryV2 courses={[course]} userId={user!.id} workspaceId={workspaceId} solutions={solutions} loading={loading} error={error}
    onRetry={onRetry} onAdd={onAdd} onMaterial={(_course,id,page) => onMaterial(id,page)} onSolution={onSolution}
    onArtifact={(_course,id,artifact) => onArtifact(id,artifact)} onConversation={onConversation}/>
}

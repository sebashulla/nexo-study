import type { Course } from '../types'

export const GENERAL_WORKSPACE = 'general'

export type StudyWorkspace = {
  id: string
  name: string
  emoji: string
  created_at: string
}

export type WorkspaceMembership = { folder_id: string; course_key: string }

export function workspaceForCourse(courseId: string, memberships: WorkspaceMembership[]) {
  return memberships.find(item => item.course_key === courseId)?.folder_id ?? GENERAL_WORKSPACE
}

export function coursesInWorkspace(courses: Course[], memberships: WorkspaceMembership[], workspaceId: string) {
  return courses.filter(course => workspaceForCourse(course.id, memberships) === workspaceId)
}

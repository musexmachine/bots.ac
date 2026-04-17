import type { SupabaseUserId, UserId, WorkspaceId } from '../ids.js'

export type User = {
  userId: UserId
  email: string
  username: string
  supabaseUserId?: SupabaseUserId
}

export type WorkspaceMembership = {
  workspaceId: WorkspaceId
  userId: UserId
  role: 'owner' | 'admin' | 'member' | 'viewer'
  joinedAt: Date
}

export type UserCreatedEvent = {
  type: 'user.created'
  userId: UserId
  email: string
  username: string
}

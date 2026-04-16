export type User = {
  userId: string
  email: string
  username: string
}

export type WorkspaceMembership = {
  workspaceId: string
  userId: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  joinedAt: Date
}

export type UserCreatedEvent = {
  type: 'user.created'
  userId: string
  email: string
  username: string
}

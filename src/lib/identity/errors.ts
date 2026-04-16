export class AuthError extends Error {
  readonly statusCode = 401

  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'AuthError'
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403

  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404

  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class UsernameError extends Error {
  readonly statusCode = 400
  readonly reason: string

  constructor(reason: string) {
    super(`Username error: ${reason}`)
    this.name = 'UsernameError'
    this.reason = reason
  }
}

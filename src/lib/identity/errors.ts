export class AuthError extends Error {
  readonly statusCode = 401

  constructor(message = 'Unauthorized') {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'AuthError'
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403

  constructor(message = 'Forbidden') {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404

  constructor(message = 'Not found') {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'NotFoundError'
  }
}

export class UsernameError extends Error {
  readonly statusCode = 400
  readonly reason: string

  constructor(reason: string) {
    super(`Username error: ${reason}`)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'UsernameError'
    this.reason = reason
  }
}

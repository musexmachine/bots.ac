export class WorkspacePolicyValidationError extends Error {
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'WorkspacePolicyValidationError'
  }
}

export class PolicyPermissionError extends Error {
  readonly statusCode = 403

  constructor(message = 'Workspace owner role required') {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'PolicyPermissionError'
  }
}

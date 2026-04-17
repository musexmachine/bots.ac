export class BillingConfigValidationError extends Error {
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'BillingConfigValidationError'
  }
}

export class BillingPermissionError extends Error {
  readonly statusCode = 403

  constructor(message = 'Only workspace owners may edit billing config') {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'BillingPermissionError'
  }
}

export class BillingWriteContentionError extends Error {
  readonly statusCode = 503

  constructor(message = 'Billing write contention; retry the request') {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'BillingWriteContentionError'
  }
}

export class PriceResolutionError extends Error {
  readonly statusCode = 422

  constructor(message = 'Unable to resolve a trustworthy model price') {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'PriceResolutionError'
  }
}

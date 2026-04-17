import { describe, expect, it } from 'vitest'
import {
  BillingConfigValidationError,
  BillingPermissionError,
  BillingWriteContentionError,
  PriceResolutionError,
} from '../errors.ts'

describe('billing errors', () => {
  it('exposes a stable error contract', () => {
    const errors = [
      [BillingConfigValidationError, 'bad config', 400],
      [BillingPermissionError, 'owner only', 403],
      [BillingWriteContentionError, 'retry later', 503],
      [PriceResolutionError, 'missing price', 422],
    ] as const

    for (const [ErrorType, message, statusCode] of errors) {
      const error = new ErrorType(message)

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(ErrorType)
      expect(Object.getPrototypeOf(error)).toBe(ErrorType.prototype)
      expect(error.name).toBe(ErrorType.name)
      expect(error.statusCode).toBe(statusCode)
    }
  })
})

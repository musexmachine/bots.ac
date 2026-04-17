import { describe, expect, it } from 'vitest'
import {
  PolicyPermissionError,
  WorkspacePolicyValidationError,
} from '../errors.ts'

describe('WorkspacePolicyValidationError', () => {
  it('exposes a 400 status code', () => {
    const error = new WorkspacePolicyValidationError('invalid policy document')

    expect(error.statusCode).toBe(400)
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(WorkspacePolicyValidationError)
    expect(Object.getPrototypeOf(error)).toBe(WorkspacePolicyValidationError.prototype)
    expect(error.name).toBe('WorkspacePolicyValidationError')
    expect(error.message).toBe('invalid policy document')
  })
})

describe('PolicyPermissionError', () => {
  it('exposes a 403 status code', () => {
    const error = new PolicyPermissionError('owner role required')

    expect(error.statusCode).toBe(403)
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(PolicyPermissionError)
    expect(Object.getPrototypeOf(error)).toBe(PolicyPermissionError.prototype)
    expect(error.name).toBe('PolicyPermissionError')
    expect(error.message).toBe('owner role required')
  })
})

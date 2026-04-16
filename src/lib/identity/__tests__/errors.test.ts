import { describe, it, expect } from 'vitest'
import { AuthError, ForbiddenError, NotFoundError, UsernameError } from '../errors.ts'

describe('AuthError', () => {
  it('has statusCode 401 and name AuthError', () => {
    const err = new AuthError()
    expect(err.statusCode).toBe(401)
    expect(err.name).toBe('AuthError')
    expect(err.message).toBe('Unauthorized')
  })

  it('accepts a custom message', () => {
    const err = new AuthError('token expired')
    expect(err.message).toBe('token expired')
  })
})

describe('ForbiddenError', () => {
  it('has statusCode 403', () => {
    expect(new ForbiddenError().statusCode).toBe(403)
  })
})

describe('NotFoundError', () => {
  it('has statusCode 404', () => {
    expect(new NotFoundError().statusCode).toBe(404)
  })
})

describe('UsernameError', () => {
  it('has statusCode 400 and exposes reason', () => {
    const err = new UsernameError('rename limit reached')
    expect(err.statusCode).toBe(400)
    expect(err.reason).toBe('rename limit reached')
    expect(err.message).toContain('rename limit reached')
  })
})

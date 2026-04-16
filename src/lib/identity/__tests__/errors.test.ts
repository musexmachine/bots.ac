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

  it('is instanceof AuthError and Error', () => {
    const err = new AuthError()
    expect(err).toBeInstanceOf(AuthError)
    expect(err).toBeInstanceOf(Error)
  })
})

describe('ForbiddenError', () => {
  it('has statusCode 403, name ForbiddenError, and default message', () => {
    const err = new ForbiddenError()
    expect(err.statusCode).toBe(403)
    expect(err.name).toBe('ForbiddenError')
    expect(err.message).toBe('Forbidden')
  })

  it('is instanceof ForbiddenError and Error', () => {
    const err = new ForbiddenError()
    expect(err).toBeInstanceOf(ForbiddenError)
    expect(err).toBeInstanceOf(Error)
  })
})

describe('NotFoundError', () => {
  it('has statusCode 404, name NotFoundError, and default message', () => {
    const err = new NotFoundError()
    expect(err.statusCode).toBe(404)
    expect(err.name).toBe('NotFoundError')
    expect(err.message).toBe('Not found')
  })

  it('is instanceof NotFoundError and Error', () => {
    const err = new NotFoundError()
    expect(err).toBeInstanceOf(NotFoundError)
    expect(err).toBeInstanceOf(Error)
  })
})

describe('UsernameError', () => {
  it('has statusCode 400 and exposes reason', () => {
    const err = new UsernameError('rename limit reached')
    expect(err.statusCode).toBe(400)
    expect(err.reason).toBe('rename limit reached')
    expect(err.message).toContain('rename limit reached')
  })

  it('is instanceof UsernameError and Error', () => {
    const err = new UsernameError('test reason')
    expect(err).toBeInstanceOf(UsernameError)
    expect(err).toBeInstanceOf(Error)
  })
})

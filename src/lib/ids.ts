import { randomUUID } from 'node:crypto'

declare const uuidBrand: unique symbol

export type UUID = string & { readonly [uuidBrand]: 'uuid' }

export type UserId = UUID
export type SupabaseUserId = string
export type WorkspaceId = UUID
export type RunId = UUID
export type PolicyVersionId = UUID
export type PolicyExceptionId = UUID
export type BillingConfigVersionId = UUID
export type RunBudgetSnapshotId = UUID
export type CostEventId = UUID

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ErrorFactory<TError extends Error> = (message: string) => TError

export function isUuid(value: unknown): value is UUID {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function assertUuid<TUuid extends UUID, TError extends Error>(
  value: unknown,
  fieldName: string,
  createError: ErrorFactory<TError>,
): TUuid {
  if (!isUuid(value)) {
    throw createError(`${fieldName} must be a valid UUID`)
  }

  return value as TUuid
}

export function assertOptionalUuid<TUuid extends UUID, TError extends Error>(
  value: unknown,
  fieldName: string,
  createError: ErrorFactory<TError>,
): TUuid | null | undefined {
  if (value === undefined || value === null) {
    return value
  }

  return assertUuid<TUuid, TError>(value, fieldName, createError)
}

export function createUuid<TUuid extends UUID>(): TUuid {
  return randomUUID() as TUuid
}

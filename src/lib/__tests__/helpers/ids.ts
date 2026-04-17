import type { UUID } from '../../ids.js'

export function testUuid(index: number): UUID {
  if (!Number.isInteger(index) || index < 0 || index > 999_999_999_999) {
    throw new Error(`testUuid index out of range: ${index}`)
  }

  return `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}` as UUID
}

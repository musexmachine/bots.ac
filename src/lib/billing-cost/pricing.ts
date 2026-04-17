import { PriceResolutionError } from './errors.js'
import {
  FALLBACK_MODEL_PRICES,
  FALLBACK_PRICE_CATALOG_VERSION,
} from './fallback-catalog.js'
import type { ResolvedModelPrice, TokenUsage } from './types.js'

export type ProviderMetadataPrice = {
  inputUsdPer1kTokens: number
  outputUsdPer1kTokens: number
  cachedInputUsdPer1kTokens?: number
  pricingReference?: string
}

export type ResolveModelPriceInput = {
  provider: string
  model: string
  metadataResolver?: (
    input: Pick<ResolveModelPriceInput, 'provider' | 'model'>,
  ) => Promise<ProviderMetadataPrice | null | undefined> | ProviderMetadataPrice | null | undefined
}

export type EstimateModelActionUsdInput = {
  price: ResolvedModelPrice
  tokenUsage: TokenUsage
}

function isTrustedUsdRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isTrustedMetadataPrice(value: unknown): value is ProviderMetadataPrice {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<ProviderMetadataPrice>

  if (!isTrustedUsdRate(candidate.inputUsdPer1kTokens)) {
    return false
  }

  if (!isTrustedUsdRate(candidate.outputUsdPer1kTokens)) {
    return false
  }

  if (
    candidate.cachedInputUsdPer1kTokens !== undefined &&
    !isTrustedUsdRate(candidate.cachedInputUsdPer1kTokens)
  ) {
    return false
  }

  return true
}

function getFallbackModelPrice(provider: string, model: string): ResolvedModelPrice | null {
  const providerCatalog = FALLBACK_MODEL_PRICES[provider as keyof typeof FALLBACK_MODEL_PRICES]

  if (providerCatalog === undefined) {
    return null
  }

  const modelPrice = providerCatalog[model as keyof typeof providerCatalog]

  if (modelPrice === undefined) {
    return null
  }

  return {
    provider,
    model,
    pricingSource: 'fallback_catalog',
    pricingReference: `fallback_catalog:${FALLBACK_PRICE_CATALOG_VERSION}:${provider}/${model}`,
    inputUsdPer1kTokens: modelPrice.inputUsdPer1kTokens,
    outputUsdPer1kTokens: modelPrice.outputUsdPer1kTokens,
  }
}

function toResolvedModelPrice(
  input: Pick<ResolveModelPriceInput, 'provider' | 'model'>,
  candidate: ProviderMetadataPrice,
): ResolvedModelPrice {
  return {
    provider: input.provider,
    model: input.model,
    pricingSource: 'provider_metadata',
    pricingReference: candidate.pricingReference ?? `provider_metadata:${input.provider}/${input.model}`,
    inputUsdPer1kTokens: candidate.inputUsdPer1kTokens,
    outputUsdPer1kTokens: candidate.outputUsdPer1kTokens,
    cachedInputUsdPer1kTokens: candidate.cachedInputUsdPer1kTokens,
  }
}

export async function resolveModelPrice(
  input: ResolveModelPriceInput,
): Promise<ResolvedModelPrice> {
  if (input.metadataResolver !== undefined) {
    try {
      const metadataPrice = await input.metadataResolver({
        provider: input.provider,
        model: input.model,
      })

      if (isTrustedMetadataPrice(metadataPrice)) {
        return toResolvedModelPrice(input, metadataPrice)
      }
    } catch {
      // Treat resolver failures as missing metadata and fall back to the catalog.
    }
  }

  const fallbackPrice = getFallbackModelPrice(input.provider, input.model)

  if (fallbackPrice !== null) {
    return fallbackPrice
  }

  throw new PriceResolutionError(
    `Unable to resolve a trustworthy model price for ${input.provider}/${input.model}`,
  )
}

function validateTokenCount(value: unknown, fieldName: string): number {
  if (!isTrustedUsdRate(value)) {
    throw new PriceResolutionError(`${fieldName} must be a finite non-negative number`)
  }

  return value
}

export function estimateModelActionUsd(input: EstimateModelActionUsdInput): number {
  const inputTokens = validateTokenCount(input.tokenUsage.inputTokens, 'inputTokens')
  const outputTokens = validateTokenCount(input.tokenUsage.outputTokens, 'outputTokens')
  const cachedInputTokens =
    input.tokenUsage.cachedInputTokens !== undefined
      ? validateTokenCount(input.tokenUsage.cachedInputTokens, 'cachedInputTokens')
      : 0

  if (cachedInputTokens > inputTokens) {
    throw new PriceResolutionError('cachedInputTokens cannot exceed inputTokens')
  }

  const uncachedInputTokens = inputTokens - cachedInputTokens
  const cachedInputRate = input.price.cachedInputUsdPer1kTokens ?? input.price.inputUsdPer1kTokens

  return (
    (uncachedInputTokens * input.price.inputUsdPer1kTokens +
      cachedInputTokens * cachedInputRate +
      outputTokens * input.price.outputUsdPer1kTokens) /
    1000
  )
}

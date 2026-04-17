import { describe, expect, it } from 'vitest'
import { PriceResolutionError } from '../errors.ts'
import { FALLBACK_MODEL_PRICES, FALLBACK_PRICE_CATALOG_VERSION } from '../fallback-catalog.ts'
import { estimateModelActionUsd, resolveModelPrice } from '../pricing.ts'

describe('resolveModelPrice', () => {
  it('uses provider metadata when available', async () => {
    const resolved = await resolveModelPrice({
      provider: 'openai',
      model: 'gpt-5-mini',
      metadataResolver: async () => ({
        inputUsdPer1kTokens: 0.009,
        outputUsdPer1kTokens: 0.033,
        cachedInputUsdPer1kTokens: 0.002,
        pricingReference: 'openai-metadata:v1',
      }),
    })

    expect(resolved).toEqual({
      provider: 'openai',
      model: 'gpt-5-mini',
      pricingSource: 'provider_metadata',
      pricingReference: 'openai-metadata:v1',
      inputUsdPer1kTokens: 0.009,
      outputUsdPer1kTokens: 0.033,
      cachedInputUsdPer1kTokens: 0.002,
    })
  })

  it('falls back to the in-code catalog when metadata is missing', async () => {
    const resolved = await resolveModelPrice({
      provider: 'openai',
      model: 'gpt-5-mini',
      metadataResolver: async () => null,
    })

    expect(resolved).toEqual({
      provider: 'openai',
      model: 'gpt-5-mini',
      pricingSource: 'fallback_catalog',
      pricingReference: `fallback_catalog:${FALLBACK_PRICE_CATALOG_VERSION}:openai/gpt-5-mini`,
      inputUsdPer1kTokens: FALLBACK_MODEL_PRICES.openai['gpt-5-mini'].inputUsdPer1kTokens,
      outputUsdPer1kTokens: FALLBACK_MODEL_PRICES.openai['gpt-5-mini'].outputUsdPer1kTokens,
    })
  })

  it('throws when neither metadata nor fallback produces a trustworthy price', async () => {
    await expect(
      resolveModelPrice({
        provider: 'unknown-provider',
        model: 'missing-model',
        metadataResolver: async () => null,
      }),
    ).rejects.toBeInstanceOf(PriceResolutionError)
  })
})

describe('estimateModelActionUsd', () => {
  it('uses input, output, and cached token rates correctly', () => {
    expect(
      estimateModelActionUsd({
        price: {
          provider: 'openai',
          model: 'gpt-5-mini',
          pricingSource: 'provider_metadata',
          pricingReference: 'openai-metadata:v1',
          inputUsdPer1kTokens: 0.01,
          outputUsdPer1kTokens: 0.02,
          cachedInputUsdPer1kTokens: 0.005,
        },
        tokenUsage: {
          inputTokens: 1000,
          outputTokens: 250,
          cachedInputTokens: 200,
        },
      }),
    ).toBeCloseTo(0.014, 6)
  })
})

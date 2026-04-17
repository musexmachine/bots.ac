export const FALLBACK_PRICE_CATALOG_VERSION = '2026-04-16'

export const FALLBACK_MODEL_PRICES = {
  openai: {
    'gpt-5-mini': {
      inputUsdPer1kTokens: 0.001,
      outputUsdPer1kTokens: 0.004,
    },
  },
} as const

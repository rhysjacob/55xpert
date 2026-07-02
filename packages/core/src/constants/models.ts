/**
 * Curated list of AI models selectable from the admin debug panel (behind the
 * model-debug feature toggle). IDs are Bedrock model / inference-profile ids —
 * verify against `aws bedrock list-foundation-models` / `list-inference-profiles`
 * before adding. The API validates any UI selection against this allow-list.
 */

/** Which assessor drives the model: Anthropic Messages body vs Bedrock Converse. */
export type AiProvider = 'bedrock-claude' | 'bedrock-converse';

/** Bedrock on-demand pricing, USD per 1M tokens. Approximate — update as needed. */
export interface ModelPricing {
  inputPerMTokUsd: number;
  outputPerMTokUsd: number;
}

export interface AiModelOption {
  id: string;
  label: string;
  provider: AiProvider;
  vision: boolean;
  pricing: ModelPricing;
  /** Short cost/accuracy hint shown in the picker. */
  note?: string;
}

/**
 * Representative token usage for ONE assessment, used to ground the per-case
 * cost estimate: ~4 downscaled images + prompts on input, a small structured
 * JSON on output. Actual usage is logged per triage (see the triage worker),
 * so these can be trued up against real numbers.
 */
export const PER_CASE_TOKEN_PROFILE = { inputTokens: 7000, outputTokens: 700 };

/** Rough USD→GBP conversion for display. Update if the rate drifts materially. */
export const USD_TO_GBP = 0.79;

export const AVAILABLE_MODELS: AiModelOption[] = [
  { id: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0', label: 'Claude Haiku 4.5', provider: 'bedrock-claude', vision: true, pricing: { inputPerMTokUsd: 1, outputPerMTokUsd: 5 }, note: 'Current default' },
  { id: 'amazon.nova-lite-v1:0', label: 'Amazon Nova Lite', provider: 'bedrock-converse', vision: true, pricing: { inputPerMTokUsd: 0.06, outputPerMTokUsd: 0.24 }, note: 'Cheapest, in-AWS (no Claude)' },
  { id: 'amazon.nova-pro-v1:0', label: 'Amazon Nova Pro', provider: 'bedrock-converse', vision: true, pricing: { inputPerMTokUsd: 0.8, outputPerMTokUsd: 3.2 }, note: 'Higher-accuracy Nova, in-AWS' },
  { id: 'eu.anthropic.claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'bedrock-claude', vision: true, pricing: { inputPerMTokUsd: 3, outputPerMTokUsd: 15 } },
  { id: 'eu.anthropic.claude-sonnet-4-5-20250929-v1:0', label: 'Claude Sonnet 4.5', provider: 'bedrock-claude', vision: true, pricing: { inputPerMTokUsd: 3, outputPerMTokUsd: 15 } },
  { id: 'eu.anthropic.claude-opus-4-7', label: 'Claude Opus 4.7', provider: 'bedrock-claude', vision: true, pricing: { inputPerMTokUsd: 5, outputPerMTokUsd: 25 } },
  { id: 'eu.anthropic.claude-opus-4-8', label: 'Claude Opus 4.8', provider: 'bedrock-claude', vision: true, pricing: { inputPerMTokUsd: 5, outputPerMTokUsd: 25 } },
  { id: 'eu.anthropic.claude-fable-5', label: 'Claude Fable 5', provider: 'bedrock-claude', vision: true, pricing: { inputPerMTokUsd: 10, outputPerMTokUsd: 50 } },
];

/** Whether a model id is in the allow-list. */
export function isAllowedModel(id: string): boolean {
  return AVAILABLE_MODELS.some((m) => m.id === id);
}

/** Look up a model option by id. */
export function getModel(id: string): AiModelOption | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}

/**
 * Estimated Bedrock cost for one assessment, in GBP pence, using
 * {@link PER_CASE_TOKEN_PROFILE}. This is what a single triage costs us — not a
 * per-million headline rate.
 */
export function estimateCostPerCasePence(pricing: ModelPricing): number {
  const usd =
    (PER_CASE_TOKEN_PROFILE.inputTokens * pricing.inputPerMTokUsd +
      PER_CASE_TOKEN_PROFILE.outputTokens * pricing.outputPerMTokUsd) /
    1_000_000;
  return Math.round(usd * USD_TO_GBP * 100 * 100) / 100; // pence, 2dp
}

import type { IDamageAssessor, AssessorConfig } from './interfaces/damage-assessor';
import { BedrockClaudeAssessor } from './providers/bedrock-claude';
import { MockDamageAssessor } from './providers/mock';

/**
 * Create a damage assessor based on the AI_PROVIDER environment variable.
 *
 * Supported providers:
 * - 'bedrock-claude' (default) — AWS Bedrock with Claude Vision
 * - 'mock' — Deterministic mock responses for testing
 */
export function createDamageAssessor(config?: AssessorConfig): IDamageAssessor {
  const provider = process.env['AI_PROVIDER'] ?? 'bedrock-claude';

  switch (provider) {
    case 'mock':
      return new MockDamageAssessor();

    case 'bedrock-claude':
    default:
      return new BedrockClaudeAssessor({
        region: config?.region ?? process.env['AWS_REGION'] ?? 'eu-west-2',
        modelId: config?.modelId ?? process.env['AI_MODEL_ID'],
        confidenceThreshold: config?.confidenceThreshold
          ? config.confidenceThreshold
          : process.env['CONFIDENCE_THRESHOLD']
            ? Number(process.env['CONFIDENCE_THRESHOLD'])
            : undefined,
      });
  }
}

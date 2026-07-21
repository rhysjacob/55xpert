import type { IDamageAssessor, AssessorConfig } from './interfaces/damage-assessor';
import { BedrockClaudeAssessor } from './providers/bedrock-claude';
import { BedrockConverseAssessor } from './providers/bedrock-converse';
import { MockDamageAssessor } from './providers/mock';
import { getModel } from '@corexpert/core';

/**
 * Create a damage assessor for the resolved model.
 *
 * The provider is derived from the model itself (via the allow-list): Claude
 * models use the Anthropic Messages body (`bedrock-claude`); Nova and other
 * families use the unified Bedrock Converse API (`bedrock-converse`). Both run on
 * Bedrock via the Lambda IAM role — no keys, no data leaving AWS. Set
 * AI_PROVIDER=mock to force deterministic test output.
 */
export function createDamageAssessor(config?: AssessorConfig): IDamageAssessor {
  if (process.env['AI_PROVIDER'] === 'mock') {
    return new MockDamageAssessor();
  }

  const modelId = config?.modelId ?? process.env['AI_MODEL_ID'];
  const region = config?.region ?? process.env['AWS_REGION'] ?? 'eu-west-2';
  const confidenceThreshold = config?.confidenceThreshold
    ? config.confidenceThreshold
    : process.env['CONFIDENCE_THRESHOLD']
      ? Number(process.env['CONFIDENCE_THRESHOLD'])
      : undefined;

  const provider = modelId ? getModel(modelId)?.provider : undefined;

  const assessorConfig: AssessorConfig = { region };
  if (modelId) assessorConfig.modelId = modelId;
  if (confidenceThreshold !== undefined) assessorConfig.confidenceThreshold = confidenceThreshold;

  if (provider === 'bedrock-converse') {
    return new BedrockConverseAssessor(assessorConfig);
  }
  return new BedrockClaudeAssessor(assessorConfig);
}

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type ImageFormat,
} from '@aws-sdk/client-bedrock-runtime';
import type {
  IDamageAssessor,
  DamageAssessmentInput,
  DamageAssessmentOutput,
  AssessorConfig,
} from '../interfaces/damage-assessor';
import { buildSystemPrompt, buildUserPrompt } from '../prompts/damage-analysis';
import { parseTriageResponse } from '../parsers/triage-response';

const DEFAULT_REGION = 'eu-west-2';
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const MAX_TOKENS = 4096;

function imageFormat(mimeType: string): ImageFormat {
  const t = mimeType.toLowerCase();
  if (t.includes('png')) return 'png';
  if (t.includes('gif')) return 'gif';
  if (t.includes('webp')) return 'webp';
  return 'jpeg';
}

/**
 * Bedrock provider using the unified **Converse API** — works across non-Anthropic
 * model families (Amazon Nova, etc.) with one request shape. Same rails as the
 * Claude provider (Bedrock InvokeModel via IAM, no key, no data leaving AWS), but
 * Converse normalizes messages/images so we don't hand-build a vendor body.
 *
 * These models don't share Anthropic's strict `output_config` schema, so we rely
 * on the JSON-only system prompt plus the defensive {@link parseTriageResponse}.
 */
export class BedrockConverseAssessor implements IDamageAssessor {
  readonly providerId = 'bedrock-converse';
  readonly modelId: string;

  private readonly client: BedrockRuntimeClient;
  private readonly confidenceThreshold: number;

  constructor(config?: AssessorConfig) {
    this.modelId = config?.modelId ?? 'amazon.nova-lite-v1:0';
    this.confidenceThreshold = config?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
    this.client = new BedrockRuntimeClient({ region: config?.region ?? DEFAULT_REGION });
  }

  async assessDamage(input: DamageAssessmentInput): Promise<DamageAssessmentOutput> {
    const content: ContentBlock[] = [];
    for (const image of input.images) {
      content.push({
        image: {
          format: imageFormat(image.mimeType),
          source: { bytes: Uint8Array.from(Buffer.from(image.base64, 'base64')) },
        },
      });
    }
    content.push({ text: buildUserPrompt(input.vehicle) });

    const response = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: buildSystemPrompt() }],
        messages: [{ role: 'user', content }],
        inferenceConfig: { maxTokens: MAX_TOKENS },
      }),
    );

    const text = response.output?.message?.content?.find((c) => c.text)?.text;
    if (!text) {
      throw new Error('No text content in Bedrock Converse response');
    }

    const result = parseTriageResponse(text, this.modelId, this.confidenceThreshold);
    result.usage = {
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
    };
    return result;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.send(
        new ConverseCommand({
          modelId: this.modelId,
          messages: [{ role: 'user', content: [{ text: 'ping' }] }],
          inferenceConfig: { maxTokens: 10 },
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
}

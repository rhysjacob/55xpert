import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type {
  IDamageAssessor,
  DamageAssessmentInput,
  DamageAssessmentOutput,
  AssessorConfig,
} from '../interfaces/damage-assessor';
import { buildSystemPrompt, buildUserPrompt } from '../prompts/damage-analysis';
import { parseTriageResponse } from '../parsers/triage-response';

const DEFAULT_MODEL_ID = 'anthropic.claude-sonnet-4-20250514';
const DEFAULT_REGION = 'eu-west-2';
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const MAX_TOKENS = 4096;

interface BedrockMessage {
  role: string;
  content: BedrockContent[];
}

type BedrockContent =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

interface BedrockResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason: string;
}

/** AWS Bedrock Claude provider for damage assessment. */
export class BedrockClaudeAssessor implements IDamageAssessor {
  readonly providerId = 'bedrock-claude';
  readonly modelId: string;

  private readonly client: BedrockRuntimeClient;
  private readonly confidenceThreshold: number;

  constructor(config?: AssessorConfig) {
    this.modelId = config?.modelId ?? DEFAULT_MODEL_ID;
    this.confidenceThreshold = config?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
    this.client = new BedrockRuntimeClient({
      region: config?.region ?? DEFAULT_REGION,
    });
  }

  async assessDamage(input: DamageAssessmentInput): Promise<DamageAssessmentOutput> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(input.vehicle);

    const userContent: BedrockContent[] = [];

    // Add images
    for (const image of input.images) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: image.mimeType,
          data: image.base64,
        },
      });
    }

    // Add text prompt
    userContent.push({ type: 'text', text: userPrompt });

    const messages: BedrockMessage[] = [
      { role: 'user', content: userContent },
    ];

    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages,
    });

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(body),
    });

    const response = await this.client.send(command);
    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body),
    ) as BedrockResponse;

    const textContent = responseBody.content.find((c) => c.type === 'text');
    if (!textContent?.text) {
      throw new Error('No text content in Bedrock response');
    }

    return parseTriageResponse(textContent.text, this.modelId, this.confidenceThreshold);
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Simple invocation with minimal input to verify connectivity
      const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      });

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: new TextEncoder().encode(body),
      });

      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }
}

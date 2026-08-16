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
import { buildSystemPrompt, buildUserPrompt, buildImageLabel } from '../prompts/damage-analysis';
import { parseTriageResponse } from '../parsers/triage-response';
import { PANEL_NAMES } from '@corexpert/core';

const DEFAULT_MODEL_ID = 'eu.anthropic.claude-sonnet-4-6';
const DEFAULT_REGION = 'eu-west-2';
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const MAX_TOKENS = 4096;

/**
 * Strict JSON schema for the damage assessment. Passed via `output_config.format`
 * so the model is constrained to valid, parseable JSON (no markdown, no drift) —
 * far more reliable than regex-extracting JSON from free text. Supported on
 * Haiku 4.5 / Sonnet 5 / Opus 4.8 (and on Bedrock). The parser remains as a
 * defensive fallback.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    // Generated BEFORE `panels`, and deliberately so — the model emits fields in
    // schema order, and a schema that opens on `panelName` makes it commit to
    // "front_" or "rear_" as its very first token, with nowhere to have worked
    // out which end it is looking at. On CX-20260816-B9QZ that produced
    // `rear_bumper` for a front-bumper close-up, and a summary that explained
    // away the two front-facing photos as "a different vehicle in the
    // background" to keep the story straight. Making it list the cues it can
    // actually see, per image, before it may name anything is what fixed it.
    // It also persists into `aiRawResponse`, so a wrong call is now auditable
    // rather than a bare panel name.
    imageFindings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          imageNumber: { type: 'number' },
          visibleCues: { type: 'string' },
          end: { type: 'string', enum: ['FRONT', 'REAR', 'SIDE_ONLY', 'UNCLEAR'] },
          showsDamage: { type: 'boolean' },
        },
        required: ['imageNumber', 'visibleCues', 'end', 'showsDamage'],
      },
    },
    panels: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          // Cited before the name, so the panel is tied to the image whose `end`
          // it must agree with.
          fromImageNumber: { type: 'number' },
          panelName: { type: 'string', enum: [...PANEL_NAMES] },
          damageType: {
            type: 'string',
            enum: ['DENT', 'SCRATCH', 'CRACK', 'SHATTER', 'DEFORMATION', 'PAINT_DAMAGE', 'STRUCTURAL'],
          },
          severity: { type: 'string', enum: ['MINOR', 'MODERATE', 'SEVERE'] },
          repairMethod: {
            type: 'string',
            enum: ['REPAIR', 'REPLACE', 'BLEND', 'PDR'],
          },
          confidenceScore: { type: 'number' },
          description: { type: 'string' },
          sizeEstimateCm: { type: 'number' },
          sizeConfidence: { type: 'number' },
        },
        required: [
          'fromImageNumber', 'panelName', 'damageType', 'severity', 'repairMethod',
          'confidenceScore', 'description', 'sizeEstimateCm', 'sizeConfidence',
        ],
      },
    },
    overallConfidence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
    summary: { type: 'string' },
    requiresHumanReview: { type: 'boolean' },
  },
  required: ['imageFindings', 'panels', 'overallConfidence', 'summary', 'requiresHumanReview'],
} as const;

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
  usage?: { input_tokens?: number; output_tokens?: number };
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

    // Caption each image before its bytes. The orientation rules in the system
    // prompt are per-photo, so the model needs a handle on which photo is which.
    input.images.forEach((image, i) => {
      userContent.push({
        type: 'text',
        text: buildImageLabel(image.imageType, i, input.images.length),
      });
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: image.mimeType,
          data: image.base64,
        },
      });
    });

    // Add text prompt
    userContent.push({ type: 'text', text: userPrompt });

    const messages: BedrockMessage[] = [
      { role: 'user', content: userContent },
    ];

    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: MAX_TOKENS,
      // Greedy decoding. This assessment decides accept-or-reject against fixed
      // numeric thresholds, so sampling from the default temperature meant the
      // same photos could land either side of a limit: two submissions of one
      // identical image set returned a 40cm and a 45cm rear quarter against a
      // 40cm limit (±4cm band), and so one REFER and one INELIGIBLE.
      //
      // This does not make the model *right* about a size it is reading off a
      // photograph, and 0 is not a determinism guarantee. It removes the
      // deliberate randomness, so a customer resubmitting the same photos gets
      // the same answer.
      temperature: 0,
      system: systemPrompt,
      messages,
      output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
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

    const result = parseTriageResponse(textContent.text, this.modelId, this.confidenceThreshold);
    result.usage = {
      inputTokens: responseBody.usage?.input_tokens,
      outputTokens: responseBody.usage?.output_tokens,
    };
    return result;
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

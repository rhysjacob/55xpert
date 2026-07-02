import type { DamageType, DamageSeverity, RepairMethod, TriageConfidence } from '@corexpert/core';
import type { VehicleSize } from '@corexpert/core';

/** Configuration for initializing a damage assessor provider. */
export interface AssessorConfig {
  /** Region for the AI service (e.g., 'eu-west-2'). */
  region?: string;
  /** Model identifier (e.g., 'anthropic.claude-sonnet-4-20250514'). */
  modelId?: string;
  /** Confidence threshold below which human review is flagged. */
  confidenceThreshold?: number;
}

/** Image input for damage assessment. */
export interface AssessmentImage {
  /** Base64-encoded image data. */
  base64: string;
  /** MIME type of the image. */
  mimeType: string;
  /** Which angle/type this image represents. */
  imageType: string;
}

/** Vehicle context to help the AI assess damage accurately. */
export interface VehicleContext {
  make?: string;
  model?: string;
  year?: number;
  colour?: string;
  vehicleSize?: VehicleSize;
}

/** A single panel detected by the AI as damaged. */
export interface DetectedPanel {
  panelName: string;
  damageType: DamageType;
  severity: DamageSeverity;
  repairMethod: RepairMethod;
  confidenceScore: number;
  description: string;
  /**
   * Estimated longest dimension of the damage on this panel, in centimetres.
   * Used by the eligibility engine to enforce the size limit (a size-5 football
   * is ~22cm). May be undefined when the AI cannot judge scale from the images.
   */
  sizeEstimateCm?: number;
  /** AI confidence (0-1) in {@link sizeEstimateCm}; low values route to Xpert review. */
  sizeConfidence?: number;
}

/** Input to the damage assessment. */
export interface DamageAssessmentInput {
  images: AssessmentImage[];
  vehicle: VehicleContext;
}

/** Token usage reported by the provider, for cost tracking. */
export interface AssessmentUsage {
  inputTokens?: number;
  outputTokens?: number;
}

/** Output from the damage assessment. */
export interface DamageAssessmentOutput {
  panels: DetectedPanel[];
  overallConfidence: TriageConfidence;
  summary: string;
  requiresHumanReview: boolean;
  rawResponse: unknown;
  modelId: string;
  usage?: AssessmentUsage;
}

/** Strategy interface for AI damage assessment providers. */
export interface IDamageAssessor {
  readonly providerId: string;
  readonly modelId: string;

  /** Assess vehicle damage from images. */
  assessDamage(input: DamageAssessmentInput): Promise<DamageAssessmentOutput>;

  /** Check if the provider is available and configured. */
  healthCheck(): Promise<boolean>;
}

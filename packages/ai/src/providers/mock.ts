import type {
  IDamageAssessor,
  DamageAssessmentInput,
  DamageAssessmentOutput,
} from '../interfaces/damage-assessor';
import type { DamageType, DamageSeverity, RepairMethod, TriageConfidence } from '@corexpert/core';

/** Mock damage assessor that returns deterministic results for testing. */
export class MockDamageAssessor implements IDamageAssessor {
  readonly providerId = 'mock';
  readonly modelId = 'mock-v1';

  async assessDamage(_input: DamageAssessmentInput): Promise<DamageAssessmentOutput> {
    return {
      panels: [
        {
          panelName: 'front_bumper',
          damageType: 'SCRATCH' as DamageType,
          severity: 'MODERATE' as DamageSeverity,
          repairMethod: 'REPAIR' as RepairMethod,
          confidenceScore: 0.92,
          description: 'Light scratches and scuffing across the front bumper surface',
          sizeEstimateCm: 12,
          sizeConfidence: 0.8,
        },
        {
          panelName: 'front_wing_nearside',
          damageType: 'DENT' as DamageType,
          severity: 'MINOR' as DamageSeverity,
          repairMethod: 'PDR' as RepairMethod,
          confidenceScore: 0.88,
          description: 'Small dent approximately 3cm diameter, no paint damage',
          sizeEstimateCm: 3,
          sizeConfidence: 0.85,
        },
        {
          panelName: 'headlight_nearside',
          damageType: 'CRACK' as DamageType,
          severity: 'SEVERE' as DamageSeverity,
          repairMethod: 'REPLACE' as RepairMethod,
          confidenceScore: 0.95,
          description: 'Cracked headlight lens requiring full unit replacement',
          sizeEstimateCm: 15,
          sizeConfidence: 0.9,
        },
      ],
      overallConfidence: 'HIGH' as TriageConfidence,
      summary: 'Vehicle shows impact damage to the front nearside. Front bumper has moderate scratching, nearside wing has a small dent suitable for PDR, and nearside headlight is cracked and requires replacement.',
      requiresHumanReview: false,
      rawResponse: { mock: true },
      modelId: this.modelId,
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

import { describe, it, expect } from 'vitest';
import { evaluateEligibility } from './eligibility';
import type { EligibilityRules } from '../schemes/types';

const RULES: EligibilityRules = {
  maxDamagedPanels: 4,
  excludedPanels: ['bonnet', 'roof'],
  maxDamageCm: 22,
  damageSizeBorderlineCm: 4,
  minSizeConfidence: 0.5,
  referOnReplace: true,
  referOnSevere: true,
};

/** A clean, confidently-sized, in-limit panel. */
const goodPanel = {
  panelName: 'nearside_front_wing',
  sizeEstimateCm: 10,
  sizeConfidence: 0.9,
  severity: 'MINOR',
  repairMethod: 'REPAIR',
};

describe('evaluateEligibility', () => {
  it('accepts a clean, in-limit case', () => {
    const r = evaluateEligibility({ panels: [goodPanel] }, RULES);
    expect(r.verdict).toBe('ELIGIBLE');
    expect(r.reasons).toHaveLength(0);
  });

  it('is INELIGIBLE over the panel-count limit', () => {
    const panels = Array.from({ length: 5 }, (_, i) => ({ ...goodPanel, panelName: `panel_${i}` }));
    const r = evaluateEligibility({ panels }, RULES);
    expect(r.verdict).toBe('INELIGIBLE');
    expect(r.reasons.map((x) => x.rule)).toContain('PANEL_COUNT');
  });

  it('is INELIGIBLE on an excluded panel', () => {
    const r = evaluateEligibility({ panels: [{ ...goodPanel, panelName: 'roof' }] }, RULES);
    expect(r.verdict).toBe('INELIGIBLE');
    expect(r.reasons.map((x) => x.rule)).toContain('EXCLUDED_PANEL');
  });

  it('REFERs a REPLACE and SEVERE panel', () => {
    const replace = evaluateEligibility({ panels: [{ ...goodPanel, repairMethod: 'REPLACE' }] }, RULES);
    expect(replace.verdict).toBe('REFER');
    const severe = evaluateEligibility({ panels: [{ ...goodPanel, severity: 'SEVERE' }] }, RULES);
    expect(severe.verdict).toBe('REFER');
  });

  it('REFERs when size confidence is too low', () => {
    const r = evaluateEligibility(
      { panels: [{ ...goodPanel, sizeConfidence: 0.3 }] },
      RULES,
    );
    expect(r.verdict).toBe('REFER');
    expect(r.reasons.map((x) => x.rule)).toContain('SIZE_UNKNOWN');
  });

  it('REFERs damage in the borderline band and rejects clearly-over damage', () => {
    const borderline = evaluateEligibility({ panels: [{ ...goodPanel, sizeEstimateCm: 20 }] }, RULES);
    expect(borderline.verdict).toBe('REFER'); // within 22±4

    const over = evaluateEligibility({ panels: [{ ...goodPanel, sizeEstimateCm: 30 }] }, RULES);
    expect(over.verdict).toBe('INELIGIBLE'); // beyond 22+4
  });

  it('takes the worst verdict across panels (INELIGIBLE beats REFER)', () => {
    const r = evaluateEligibility(
      {
        panels: [
          { ...goodPanel, repairMethod: 'REPLACE' }, // REFER
          { ...goodPanel, panelName: 'bonnet' }, // INELIGIBLE
        ],
      },
      RULES,
    );
    expect(r.verdict).toBe('INELIGIBLE');
  });
});

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
  totalLossThresholdPct: 80,
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

describe('evaluateEligibility — repeated panels', () => {
  it('counts two damage areas on one panel as one damaged panel', () => {
    // Five entries but three panels: under the limit of 4.
    const r = evaluateEligibility(
      {
        panels: [
          { ...goodPanel, panelName: 'rear_bumper' },
          { ...goodPanel, panelName: 'rear_bumper' },
          { ...goodPanel, panelName: 'offside_front_door' },
          { ...goodPanel, panelName: 'offside_front_door' },
          { ...goodPanel, panelName: 'nearside_sill' },
        ],
      },
      RULES,
    );
    expect(r.reasons.some((x) => x.rule === 'PANEL_COUNT')).toBe(false);
    expect(r.verdict).toBe('ELIGIBLE');
  });

  it('still rejects when the distinct panel count exceeds the maximum', () => {
    const names = ['rear_bumper', 'front_bumper', 'offside_sill', 'nearside_sill', 'tailgate'];
    const r = evaluateEligibility(
      { panels: names.map((panelName) => ({ ...goodPanel, panelName })) },
      RULES,
    );
    const hit = r.reasons.find((x) => x.rule === 'PANEL_COUNT');
    expect(hit?.detail).toContain('5 damaged panels');
    expect(r.verdict).toBe('INELIGIBLE');
  });
});

describe('damage size is judged per distinct panel', () => {
  const rules: EligibilityRules = { ...RULES, maxDamageCm: 40, referOnReplace: false, referOnSevere: false };

  // CX-20260816-MJ55: one rear bumper, read twice off two photos. The hazier
  // read must not refer a case the confident read clears.
  it('sizes a panel by its most confident reading, not its haziest', () => {
    const result = evaluateEligibility(
      {
        panels: [
          { panelName: 'rear_bumper', sizeEstimateCm: 10, sizeConfidence: 0.45 },
          { panelName: 'rear_bumper', sizeEstimateCm: 13, sizeConfidence: 0.5 },
        ],
      },
      rules,
    );
    expect(result.verdict).toBe('ELIGIBLE');
    expect(result.reasons).toHaveLength(0);
  });

  it('still refers when every reading of a panel is hazy', () => {
    const result = evaluateEligibility(
      {
        panels: [
          { panelName: 'rear_bumper', sizeEstimateCm: 10, sizeConfidence: 0.45 },
          { panelName: 'rear_bumper', sizeEstimateCm: 13, sizeConfidence: 0.3 },
        ],
      },
      rules,
    );
    expect(result.verdict).toBe('REFER');
    expect(result.reasons[0]?.rule).toBe('SIZE_UNKNOWN');
  });

  it('takes the larger estimate when confidence ties', () => {
    const result = evaluateEligibility(
      {
        panels: [
          { panelName: 'rear_bumper', sizeEstimateCm: 20, sizeConfidence: 0.9 },
          { panelName: 'rear_bumper', sizeEstimateCm: 45, sizeConfidence: 0.9 },
        ],
      },
      rules,
    );
    expect(result.verdict).toBe('INELIGIBLE');
  });

  it('judges different panels independently', () => {
    const result = evaluateEligibility(
      {
        panels: [
          { panelName: 'rear_bumper', sizeEstimateCm: 13, sizeConfidence: 0.8 },
          { panelName: 'nearside_tail_light', sizeEstimateCm: 5, sizeConfidence: 0.4 },
        ],
      },
      rules,
    );
    expect(result.verdict).toBe('REFER');
    expect(result.reasons[0]?.detail).toContain('Tail Light');
  });

  it('still refers a panel with no size at all', () => {
    const result = evaluateEligibility({ panels: [{ panelName: 'rear_bumper' }] }, rules);
    expect(result.verdict).toBe('REFER');
    expect(result.reasons[0]?.rule).toBe('SIZE_UNKNOWN');
  });
});

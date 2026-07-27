import { describe, it, expect } from 'vitest';
import { assessTotalLoss } from './total-loss';

describe('assessTotalLoss', () => {
  it('flags a total loss at or above the threshold', () => {
    // £8,000 repair on a £10,000 car = 80% → total loss at 80% threshold.
    const r = assessTotalLoss({ estimatedCostPence: 800_000, vehicleValuePence: 1_000_000, thresholdPct: 80 });
    expect(r.isTotalLoss).toBe(true);
    expect(r.ratioPct).toBe(80);
  });

  it('does not flag below the threshold', () => {
    const r = assessTotalLoss({ estimatedCostPence: 799_999, vehicleValuePence: 1_000_000, thresholdPct: 80 });
    expect(r.isTotalLoss).toBe(false);
  });

  it('flags well over the threshold and reports the ratio', () => {
    const r = assessTotalLoss({ estimatedCostPence: 1_200_000, vehicleValuePence: 1_000_000, thresholdPct: 80 });
    expect(r.isTotalLoss).toBe(true);
    expect(r.ratioPct).toBe(120);
  });

  it('never flags when the value is missing or non-positive', () => {
    expect(assessTotalLoss({ estimatedCostPence: 500_000, vehicleValuePence: 0, thresholdPct: 80 }).isTotalLoss).toBe(false);
    expect(assessTotalLoss({ estimatedCostPence: 500_000, vehicleValuePence: -1, thresholdPct: 80 }).isTotalLoss).toBe(false);
  });

  it('respects a custom threshold', () => {
    const r = assessTotalLoss({ estimatedCostPence: 700_000, vehicleValuePence: 1_000_000, thresholdPct: 70 });
    expect(r.isTotalLoss).toBe(true);
  });
});

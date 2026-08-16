import { describe, it, expect } from 'vitest';
import { mergePanelsForDisplay } from './panel-display';
import type { DamagePanel } from '../types/triage';

const p = (o: Partial<DamagePanel> & { panelName: string }): DamagePanel => ({
  damageType: 'SCRATCH', severity: 'MINOR', repairMethod: 'REPAIR',
  confidenceScore: 0.7, description: 'scuff', ...o,
}) as DamagePanel;

describe('mergePanelsForDisplay', () => {
  // A car has one nearside rear quarter; three photos of it is still one panel.
  it('shows one row per panel however many photos caught it', () => {
    const merged = mergePanelsForDisplay([
      p({ panelName: 'nearside_rear_quarter', sizeEstimateCm: 35 }),
      p({ panelName: 'rear_bumper', sizeEstimateCm: 20 }),
      p({ panelName: 'nearside_rear_quarter', sizeEstimateCm: 40 }),
      p({ panelName: 'rear_bumper', sizeEstimateCm: 25 }),
      p({ panelName: 'nearside_rear_quarter', sizeEstimateCm: 30 }),
    ]);
    expect(merged.map((x) => x.panelName)).toEqual(['nearside_rear_quarter', 'rear_bumper']);
  });

  it('keeps the worst case — largest size, most severe, highest confidence', () => {
    const [merged] = mergePanelsForDisplay([
      p({ panelName: 'rear_bumper', sizeEstimateCm: 20, severity: 'MINOR', confidenceScore: 0.6, description: 'small' }),
      p({ panelName: 'rear_bumper', sizeEstimateCm: 40, severity: 'SEVERE', confidenceScore: 0.9, description: 'big' }),
    ]);
    expect(merged?.sizeEstimateCm).toBe(40);
    expect(merged?.severity).toBe('SEVERE');
    expect(merged?.confidenceScore).toBe(0.9);
    expect(merged?.description).toBe('big');
  });

  it('takes severity from any reading, not just the largest', () => {
    const [merged] = mergePanelsForDisplay([
      p({ panelName: 'rear_bumper', sizeEstimateCm: 40, severity: 'MINOR' }),
      p({ panelName: 'rear_bumper', sizeEstimateCm: 10, severity: 'SEVERE' }),
    ]);
    expect(merged?.sizeEstimateCm).toBe(40);
    expect(merged?.severity).toBe('SEVERE');
  });

  it('leaves genuinely distinct panels alone', () => {
    const merged = mergePanelsForDisplay([
      p({ panelName: 'front_bumper' }), p({ panelName: 'grille' }), p({ panelName: 'bonnet' }),
    ]);
    expect(merged).toHaveLength(3);
  });

  it('copes with panels that have no size', () => {
    const merged = mergePanelsForDisplay([p({ panelName: 'roof' }), p({ panelName: 'roof' })]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.sizeEstimateCm).toBeUndefined();
  });
});

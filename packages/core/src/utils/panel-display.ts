import type { DamagePanel } from '../types/triage';

const SEVERITY_RANK: Record<string, number> = { MINOR: 0, MODERATE: 1, SEVERE: 2 };

/**
 * One row per damaged panel, for anything that shows a damage list to a person.
 *
 * The assessment reports a panel once per PHOTOGRAPH it was seen in — a panel
 * cites the image it came from, which is what pins it to a front or rear
 * orientation. Three shots of one dented quarter therefore arrive as three
 * entries. Pricing and eligibility already collapse them, so a screen rendering
 * the raw array showed "2 panels affected" above five rows, three of them the
 * same quarter panel a car only has one of.
 *
 * Merged to the worst case, matching how the limit is judged: the largest size,
 * the most severe severity, and the highest confidence across the readings, with
 * the description from whichever reading measured largest.
 */
export function mergePanelsForDisplay(panels: DamagePanel[]): DamagePanel[] {
  const byName = new Map<string, DamagePanel>();

  for (const panel of panels) {
    const held = byName.get(panel.panelName);
    if (!held) {
      byName.set(panel.panelName, { ...panel });
      continue;
    }

    const size = panel.sizeEstimateCm ?? -1;
    const heldSize = held.sizeEstimateCm ?? -1;
    const merged: DamagePanel = size > heldSize ? { ...panel } : { ...held };

    merged.confidenceScore = Math.max(held.confidenceScore, panel.confidenceScore);
    merged.severity =
      (SEVERITY_RANK[panel.severity] ?? 0) > (SEVERITY_RANK[held.severity] ?? 0)
        ? panel.severity
        : held.severity;

    const bestSize = Math.max(size, heldSize);
    if (bestSize >= 0) merged.sizeEstimateCm = bestSize;

    byName.set(panel.panelName, merged);
  }

  return [...byName.values()];
}

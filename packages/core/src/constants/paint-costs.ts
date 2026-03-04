/**
 * Paint material costs in pence by panel size category.
 * Applies to REPAIR, REPLACE, BLEND, and SMART_REPAIR methods.
 * PDR has no paint cost.
 */
export const PAINT_COSTS: Record<'small' | 'medium' | 'large', number> = {
  small: 3000,  // £30
  medium: 5000, // £50
  large: 8000,  // £80
};

/** Returns paint cost for a given panel size category and repair method. */
export function getPaintCost(
  sizeCategory: 'small' | 'medium' | 'large',
  repairMethod: string,
): number {
  if (repairMethod === 'PDR') return 0;
  // Glass and lights don't need paint
  return PAINT_COSTS[sizeCategory];
}

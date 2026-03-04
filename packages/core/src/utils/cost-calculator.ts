import type { VehicleSize } from '../types/vehicle';
import type { RepairMethod } from '../types/triage';
import { DEFAULT_LABOUR_RATES, VAT_RATE, SUNDRIES_RATE } from '../constants/labour-rates';
import { getLabourTime } from '../constants/labour-times';
import { getPartsPrice } from '../constants/parts-prices';
import { getPaintCost } from '../constants/paint-costs';
import { PANEL_SIZE_CATEGORY } from '../constants/panels';

export interface CostCalculatorInput {
  panels: CostPanelInput[];
  vehicleSize: VehicleSize;
  labourRateOverride?: number;
}

export interface CostPanelInput {
  panelName: string;
  repairMethod: RepairMethod;
}

export interface PanelCostBreakdown {
  panelName: string;
  repairMethod: string;
  labourHours: number;
  labourCost: number;
  partsCost: number;
  paintCost: number;
  subtotal: number;
}

export interface CostCalculatorOutput {
  panelCosts: PanelCostBreakdown[];
  totalLabourHours: number;
  totalLabourCost: number;
  totalPartsCost: number;
  totalPaintCost: number;
  totalSundries: number;
  subtotal: number;
  vat: number;
  grandTotal: number;
}

/**
 * Calculate indicative repair costs based on detected damage panels.
 * All monetary values are in pence.
 */
export function calculateCosts(input: CostCalculatorInput): CostCalculatorOutput {
  const labourRate = input.labourRateOverride ?? DEFAULT_LABOUR_RATES[input.vehicleSize];

  const panelCosts: PanelCostBreakdown[] = input.panels.map((panel) => {
    const labourHours = getLabourTime(panel.panelName, panel.repairMethod);
    const labourCost = Math.round(labourHours * labourRate);
    const partsCost = getPartsPrice(panel.panelName, input.vehicleSize, panel.repairMethod);

    const sizeCategory =
      PANEL_SIZE_CATEGORY[panel.panelName as keyof typeof PANEL_SIZE_CATEGORY] ?? 'medium';
    const paintCost = getPaintCost(sizeCategory, panel.repairMethod);

    return {
      panelName: panel.panelName,
      repairMethod: panel.repairMethod,
      labourHours,
      labourCost,
      partsCost,
      paintCost,
      subtotal: labourCost + partsCost + paintCost,
    };
  });

  const totalLabourHours = panelCosts.reduce((sum, p) => sum + p.labourHours, 0);
  const totalLabourCost = panelCosts.reduce((sum, p) => sum + p.labourCost, 0);
  const totalPartsCost = panelCosts.reduce((sum, p) => sum + p.partsCost, 0);
  const totalPaintCost = panelCosts.reduce((sum, p) => sum + p.paintCost, 0);

  const subtotalBeforeSundries = totalLabourCost + totalPartsCost + totalPaintCost;
  const totalSundries = Math.round(subtotalBeforeSundries * SUNDRIES_RATE);
  const subtotal = subtotalBeforeSundries + totalSundries;
  const vat = Math.round(subtotal * VAT_RATE);
  const grandTotal = subtotal + vat;

  return {
    panelCosts,
    totalLabourHours,
    totalLabourCost,
    totalPartsCost,
    totalPaintCost,
    totalSundries,
    subtotal,
    vat,
    grandTotal,
  };
}

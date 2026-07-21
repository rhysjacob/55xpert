import type { WarrantyScheme } from './types';

/**
 * TEMPLATE for a second warranty company. Clone this, rename, and fill in the
 * company's own thresholds and prices, then register it in `index.ts`. Values
 * below are ILLUSTRATIVE placeholders — replace before using.
 */
export const companyX: WarrantyScheme = {
  id: 'company-x',
  name: 'Company X (template)',
  eligibility: {
    maxDamagedPanels: 3, // e.g. stricter than Company 2025
    excludedPanels: ['bonnet', 'roof', 'front_windscreen', 'rear_windscreen'],
    maxDamageCm: 20,
    damageSizeBorderlineCm: 3,
    minSizeConfidence: 0.6,
    referOnReplace: true,
    referOnSevere: true,
  },
  matrix: {
    version: 'x-2026',
    vatRate: 0.2,
    panelMatrix: {
      1: { PAINT: 70000, REPAIR_PAINT: 90000, FLATLINE_REPAIR_PAINT: 130000 },
      2: { PAINT: 90000, REPAIR_PAINT: 115000, FLATLINE_REPAIR_PAINT: 155000 },
      3: { PAINT: 118000, REPAIR_PAINT: 150000, FLATLINE_REPAIR_PAINT: 185000 },
      4: { PAINT: 150000, REPAIR_PAINT: 180000, FLATLINE_REPAIR_PAINT: 215000 },
    },
    bumperMatrix: { LOCAL_PAINT: 40000, PAINT: 68000, REPAIR_PAINT: 88000 },
    mirrorCoverPrice: 18000,
    charges: {
      BUMPER_AND_FITTING_KITS: 20000,
      BOLT_ON_WING: 20000,
      WINGMIRROR: 15000,
      TRIM: 15000,
      REPAIR_METHODS: 9000,
      ADAS_METHODS: 7000,
      LIGHT_CLUSTER: 15000,
      FAILED_CALL_OUT: 14000,
      MOBILE_CHARGE: 32000,
      EPA: 2500,
      PARTS_DISTRIBUTION: 4000,
      PRE_DIAGNOSTICS: 15000,
      POST_DIAGNOSTICS: 6000,
      REPAIRS_INSIDE_M25: 4000,
      PANEL_REPAIR_SUNDRIES: 2500,
      CAR_CARE_KIT: 750,
      PLASTIC_REPAIR_KIT: 2500,
      SPECIALIST_PAINT: 15000,
      FIRSTLOOK_AI: 2000,
    },
    adasCalibrationUplift: 0.15,
    commercialServiceCharge: 5000,
  },
};

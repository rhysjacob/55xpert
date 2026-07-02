import type { WarrantyScheme } from './types';

/**
 * Company 2025 — the current live ruleset (from the CONFIDENTIAL Company 2025
 * Matrix). This is the reference scheme; new warranty companies clone this shape
 * with their own thresholds and prices.
 */
export const company2025: WarrantyScheme = {
  id: 'company-2025',
  name: 'Company 2025',
  eligibility: {
    maxDamagedPanels: 4,
    excludedPanels: ['bonnet', 'roof'],
    maxDamageCm: 22,
    damageSizeBorderlineCm: 4,
    minSizeConfidence: 0.5,
    referOnReplace: true,
    referOnSevere: true,
  },
  matrix: {
    version: '2025',
    vatRate: 0.2,
    panelMatrix: {
      1: { PAINT: 77400, REPAIR_PAINT: 96900, FLATLINE_REPAIR_PAINT: 140400 },
      2: { PAINT: 96500, REPAIR_PAINT: 122300, FLATLINE_REPAIR_PAINT: 166400 },
      3: { PAINT: 125500, REPAIR_PAINT: 158500, FLATLINE_REPAIR_PAINT: 194000 },
      4: { PAINT: 158200, REPAIR_PAINT: 190900, FLATLINE_REPAIR_PAINT: 228000 },
    },
    bumperMatrix: { LOCAL_PAINT: 41100, PAINT: 71900, REPAIR_PAINT: 91600 },
    mirrorCoverPrice: 19700,
    charges: {
      BUMPER_AND_FITTING_KITS: 20350,
      BOLT_ON_WING: 20350,
      WINGMIRROR: 15950,
      TRIM: 15950,
      REPAIR_METHODS: 9500,
      ADAS_METHODS: 7000,
      LIGHT_CLUSTER: 15950,
      FAILED_CALL_OUT: 14600,
      MOBILE_CHARGE: 32900,
      EPA: 2750,
      PARTS_DISTRIBUTION: 4400,
      PRE_DIAGNOSTICS: 15400,
      POST_DIAGNOSTICS: 6050,
      REPAIRS_INSIDE_M25: 4200,
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

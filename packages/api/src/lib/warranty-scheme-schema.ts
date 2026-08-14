import { z } from 'zod';
import { MATRIX_CHARGE_KEYS, MatrixPaintCategory } from '@corexpert/core';
import type { WarrantyCompanyScheme } from '@corexpert/core';

// ---------------------------------------------------------------------------
// Runtime validation for a company ruleset. Because rulesets are now data
// (created/edited via the API rather than hardcoded), they must be validated on
// write against the shape the eligibility engine and matrix calculator expect.
// ---------------------------------------------------------------------------

const nonNegInt = z.number().int().nonnegative();
const positiveInt = z.number().int().positive();

const paintCategoryPrices = z
  .record(z.nativeEnum(MatrixPaintCategory), z.number().int().nonnegative())
  .refine((r) => Object.keys(r).length > 0, 'at least one paint category price is required');

const eligibilitySchema = z.object({
  maxDamagedPanels: positiveInt,
  excludedPanels: z.array(z.string()),
  maxDamageCm: z.number().positive(),
  damageSizeBorderlineCm: z.number().nonnegative(),
  minSizeConfidence: z.number().min(0).max(1),
  referOnReplace: z.boolean(),
  referOnSevere: z.boolean(),
  // Optional: companies onboarded before this existed have no value stored, and
  // absent must keep meaning "refer" rather than failing their saved ruleset.
  referOnAiUncertainty: z.boolean().optional(),
  totalLossThresholdPct: z.number().min(0).max(100),
});

const matrixSchema = z.object({
  version: z.string().min(1),
  vatRate: z.number().min(0).max(1),
  panelMatrix: z.object({
    1: paintCategoryPrices,
    2: paintCategoryPrices,
    3: paintCategoryPrices,
    4: paintCategoryPrices,
  }),
  bumperMatrix: paintCategoryPrices,
  mirrorCoverPrice: nonNegInt,
  charges: z.record(z.enum(MATRIX_CHARGE_KEYS), nonNegInt),
  adasCalibrationUplift: z.number().min(0),
  commercialServiceCharge: nonNegInt,
});

/** Zod schema for a company ruleset (eligibility + pricing matrix). */
export const warrantyCompanySchemeSchema = z.object({
  eligibility: eligibilitySchema,
  matrix: matrixSchema,
});

/** Validate + narrow an unknown value to a WarrantyCompanyScheme. Throws on invalid. */
export function parseCompanyScheme(value: unknown): WarrantyCompanyScheme {
  return warrantyCompanySchemeSchema.parse(value) as WarrantyCompanyScheme;
}

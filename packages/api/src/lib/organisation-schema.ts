import { z } from 'zod';
import { normalisePostcode } from '@corexpert/core';
import type { RepairerCapability } from '@corexpert/core';

const vehicleSize = z.enum(['SMALL', 'MEDIUM', 'LARGE', 'VAN', 'SUV']);
const repairMethod = z.enum(['REPAIR', 'REPLACE', 'BLEND', 'PDR']);

/**
 * A repairer org's capability + coverage (TRX-18). Coverage areas and the base
 * postcode are normalised (uppercase, no spaces) on write so they compare
 * cleanly against job postcodes in the matcher.
 */
export const capabilitySchema = z
  .object({
    vehicleSizes: z.array(vehicleSize),
    repairMethods: z.array(repairMethod),
    coverageAreas: z.array(z.string().min(1).max(8)).max(200),
    basePostcode: z.string().min(1).max(8).optional(),
    /** Fallback coverage radius (km) used when the job's area isn't listed. */
    coverageRadiusKm: z.number().positive().max(500).optional(),
  })
  .transform((c): RepairerCapability => ({
    vehicleSizes: c.vehicleSizes,
    repairMethods: c.repairMethods,
    coverageAreas: [...new Set(c.coverageAreas.map(normalisePostcode).filter(Boolean))],
    ...(c.basePostcode ? { basePostcode: normalisePostcode(c.basePostcode) } : {}),
    ...(c.coverageRadiusKm != null ? { coverageRadiusKm: c.coverageRadiusKm } : {}),
  }));

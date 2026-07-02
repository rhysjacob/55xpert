import type { WarrantyScheme } from './types';
import { company2025 } from './company-2025';
import { companyX } from './company-x';

export * from './types';

/** All known warranty schemes, keyed by id. Register new companies here. */
export const SCHEMES: Record<string, WarrantyScheme> = {
  [company2025.id]: company2025,
  [companyX.id]: companyX,
};

/** The scheme used when none is specified. */
export const DEFAULT_SCHEME_ID = company2025.id;

/** Look up a scheme by id; falls back to the default for unknown ids. */
export function getScheme(id?: string): WarrantyScheme {
  return (id && SCHEMES[id]) || SCHEMES[DEFAULT_SCHEME_ID]!;
}

/**
 * The active scheme, selected at build/deploy time. Callers pass the resolved id
 * from their environment (Node: `process.env.WARRANTY_SCHEME`; Vite:
 * `import.meta.env.VITE_WARRANTY_SCHEME`) so this stays environment-agnostic.
 * Omit to get the default scheme.
 */
export function getActiveScheme(id?: string): WarrantyScheme {
  return getScheme(id);
}

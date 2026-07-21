import type { EligibilityRules, MatrixConfig } from '../schemes/types';

/**
 * A warranty company (tenant) and its ruleset. Multi-tenancy phase 1: the
 * ruleset moves from a hardcoded, deploy-time-selected scheme to per-company
 * data, so a new company can be onboarded with its own eligibility rules and
 * pricing matrix without a deploy. See docs/multi-tenancy-spec.md.
 */

export const WarrantyCompanyStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type WarrantyCompanyStatus =
  (typeof WarrantyCompanyStatus)[keyof typeof WarrantyCompanyStatus];

/** A company's ruleset — the same shape as a WarrantyScheme, minus id/name. */
export interface WarrantyCompanyScheme {
  eligibility: EligibilityRules;
  matrix: MatrixConfig;
}

export interface WarrantyCompany {
  warrantyCompanyId: string;
  name: string;
  status: WarrantyCompanyStatus;
  /** This company's eligibility rules + pricing matrix. */
  scheme: WarrantyCompanyScheme;
  createdAt: string;
  updatedAt: string;
}

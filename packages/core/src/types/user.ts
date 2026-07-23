export const UserRole = {
  CONSUMER: 'CONSUMER',
  REPAIRER: 'REPAIRER',
  XPERT: 'XPERT',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/** Stripe subscription statuses (mirrors Stripe's `Subscription.status`). */
export const SubscriptionStatus = {
  INCOMPLETE: 'incomplete',
  INCOMPLETE_EXPIRED: 'incomplete_expired',
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  UNPAID: 'unpaid',
  PAUSED: 'paused',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

/** Whether a subscription status lets a repairer accept jobs (in good standing). */
export function isSubscriptionActive(status: SubscriptionStatus | undefined): boolean {
  return status === 'active' || status === 'trialing';
}

export interface User {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
  /**
   * The repairer organisation this user belongs to (TRX-52). Top-level (not on
   * the nested profile) so it can back the organisationId GSI for member
   * listing and enable/disable cascades. Absent for a legacy standalone
   * repairer, matched from their own profile/preferences.
   */
  organisationId?: string;
  repairer?: RepairerProfile;
  preferences?: RepairerPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface RepairerProfile {
  businessName: string;
  contactName?: string;
  phone?: string;
  address?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
  isVerified: boolean;
  stripeCustomerId?: string;
  /** Stripe subscription id once the repairer subscribes. */
  stripeSubscriptionId?: string;
  /** Current subscription status, kept in sync from Stripe subscription events. */
  subscriptionStatus?: SubscriptionStatus;
}

export interface RepairerPreferences {
  maxDistanceMiles?: number;
  minLabourRate?: number;
  vehicleSizes: VehicleSize[];
  repairMethods: RepairMethod[];
  notifyByEmail: boolean;
}

// Re-export from vehicle/triage for convenience in preferences
import type { VehicleSize } from './vehicle';
import type { RepairMethod } from './triage';

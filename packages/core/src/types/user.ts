export const UserRole = {
  CONSUMER: 'CONSUMER',
  REPAIRER: 'REPAIRER',
  XPERT: 'XPERT',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export interface User {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
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

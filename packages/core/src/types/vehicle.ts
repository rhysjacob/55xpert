export const VehicleSize = {
  SMALL: 'SMALL',
  MEDIUM: 'MEDIUM',
  LARGE: 'LARGE',
  VAN: 'VAN',
  SUV: 'SUV',
} as const;
export type VehicleSize = (typeof VehicleSize)[keyof typeof VehicleSize];

export interface Vehicle {
  registrationNo?: string;
  make?: string;
  model?: string;
  variant?: string;
  year?: number;
  colour?: string;
  vehicleSize?: VehicleSize;
}

export interface VehicleLookupResponse {
  found: boolean;
  vehicle?: Vehicle;
}

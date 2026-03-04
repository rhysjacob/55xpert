import type { VehicleSize } from '../types/vehicle';
import type { PanelName } from './panels';

/**
 * Indicative parts prices in pence by panel and vehicle size.
 * Only applicable for REPLACE repair method. All other methods have zero parts cost.
 * These are representative aftermarket prices for the MVP.
 */
type PartsKey = `${PanelName}_${VehicleSize}`;

const PRICES: Partial<Record<PartsKey, number>> = {
  // Front bumper
  front_bumper_SMALL: 15000,
  front_bumper_MEDIUM: 20000,
  front_bumper_LARGE: 28000,
  front_bumper_VAN: 22000,
  front_bumper_SUV: 30000,

  // Rear bumper
  rear_bumper_SMALL: 14000,
  rear_bumper_MEDIUM: 18000,
  rear_bumper_LARGE: 25000,
  rear_bumper_VAN: 20000,
  rear_bumper_SUV: 28000,

  // Bonnet
  bonnet_SMALL: 20000,
  bonnet_MEDIUM: 28000,
  bonnet_LARGE: 35000,
  bonnet_VAN: 30000,
  bonnet_SUV: 38000,

  // Boot lid
  boot_lid_SMALL: 18000,
  boot_lid_MEDIUM: 25000,
  boot_lid_LARGE: 32000,
  boot_lid_VAN: 28000,
  boot_lid_SUV: 35000,

  // Wings
  nearside_front_wing_SMALL: 12000,
  nearside_front_wing_MEDIUM: 16000,
  nearside_front_wing_LARGE: 22000,
  nearside_front_wing_VAN: 18000,
  nearside_front_wing_SUV: 24000,
  offside_front_wing_SMALL: 12000,
  offside_front_wing_MEDIUM: 16000,
  offside_front_wing_LARGE: 22000,
  offside_front_wing_VAN: 18000,
  offside_front_wing_SUV: 24000,

  // Doors
  nearside_front_door_SMALL: 25000,
  nearside_front_door_MEDIUM: 32000,
  nearside_front_door_LARGE: 40000,
  nearside_front_door_VAN: 35000,
  nearside_front_door_SUV: 42000,
  offside_front_door_SMALL: 25000,
  offside_front_door_MEDIUM: 32000,
  offside_front_door_LARGE: 40000,
  offside_front_door_VAN: 35000,
  offside_front_door_SUV: 42000,
  nearside_rear_door_SMALL: 25000,
  nearside_rear_door_MEDIUM: 32000,
  nearside_rear_door_LARGE: 40000,
  nearside_rear_door_VAN: 35000,
  nearside_rear_door_SUV: 42000,
  offside_rear_door_SMALL: 25000,
  offside_rear_door_MEDIUM: 32000,
  offside_rear_door_LARGE: 40000,
  offside_rear_door_VAN: 35000,
  offside_rear_door_SUV: 42000,

  // Mirrors
  nearside_mirror_SMALL: 8000,
  nearside_mirror_MEDIUM: 12000,
  nearside_mirror_LARGE: 18000,
  nearside_mirror_VAN: 10000,
  nearside_mirror_SUV: 20000,
  offside_mirror_SMALL: 8000,
  offside_mirror_MEDIUM: 12000,
  offside_mirror_LARGE: 18000,
  offside_mirror_VAN: 10000,
  offside_mirror_SUV: 20000,

  // Lights
  nearside_headlight_SMALL: 15000,
  nearside_headlight_MEDIUM: 25000,
  nearside_headlight_LARGE: 40000,
  nearside_headlight_VAN: 20000,
  nearside_headlight_SUV: 45000,
  offside_headlight_SMALL: 15000,
  offside_headlight_MEDIUM: 25000,
  offside_headlight_LARGE: 40000,
  offside_headlight_VAN: 20000,
  offside_headlight_SUV: 45000,
  nearside_tail_light_SMALL: 8000,
  nearside_tail_light_MEDIUM: 12000,
  nearside_tail_light_LARGE: 18000,
  nearside_tail_light_VAN: 10000,
  nearside_tail_light_SUV: 20000,
  offside_tail_light_SMALL: 8000,
  offside_tail_light_MEDIUM: 12000,
  offside_tail_light_LARGE: 18000,
  offside_tail_light_VAN: 10000,
  offside_tail_light_SUV: 20000,

  // Glass
  front_windscreen_SMALL: 15000,
  front_windscreen_MEDIUM: 20000,
  front_windscreen_LARGE: 28000,
  front_windscreen_VAN: 22000,
  front_windscreen_SUV: 30000,
  rear_windscreen_SMALL: 12000,
  rear_windscreen_MEDIUM: 16000,
  rear_windscreen_LARGE: 22000,
  rear_windscreen_VAN: 18000,
  rear_windscreen_SUV: 24000,

  // Grille
  grille_SMALL: 5000,
  grille_MEDIUM: 8000,
  grille_LARGE: 12000,
  grille_VAN: 8000,
  grille_SUV: 15000,

  // Tailgate
  tailgate_SMALL: 22000,
  tailgate_MEDIUM: 30000,
  tailgate_LARGE: 38000,
  tailgate_VAN: 35000,
  tailgate_SUV: 40000,
};

/** Default parts price if a specific combo is not found (pence). */
const DEFAULT_PARTS_PRICE = 20000;

/** Look up parts price for a panel and vehicle size. Returns 0 for non-REPLACE methods. */
export function getPartsPrice(
  panelName: string,
  vehicleSize: string,
  repairMethod: string,
): number {
  if (repairMethod !== 'REPLACE') return 0;
  const key = `${panelName}_${vehicleSize}` as PartsKey;
  return PRICES[key] ?? DEFAULT_PARTS_PRICE;
}

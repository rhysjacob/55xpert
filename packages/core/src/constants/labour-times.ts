import type { RepairMethod } from '../types/triage';
import type { PanelName } from './panels';

/**
 * Labour time in hours per panel per repair method.
 * These are indicative times for the MVP rules engine.
 * Key format: `${panelName}_${repairMethod}`
 */
type LabourTimeKey = `${PanelName}_${RepairMethod}`;

const TIMES: Partial<Record<LabourTimeKey, number>> = {
  // Front bumper
  front_bumper_REPAIR: 3.0,
  front_bumper_REPLACE: 2.0,
  front_bumper_SMART_REPAIR: 1.5,
  front_bumper_BLEND: 1.0,

  // Rear bumper
  rear_bumper_REPAIR: 3.0,
  rear_bumper_REPLACE: 2.0,
  rear_bumper_SMART_REPAIR: 1.5,
  rear_bumper_BLEND: 1.0,

  // Bonnet
  bonnet_REPAIR: 4.0,
  bonnet_REPLACE: 3.0,
  bonnet_PDR: 1.5,
  bonnet_BLEND: 1.5,

  // Boot lid
  boot_lid_REPAIR: 3.5,
  boot_lid_REPLACE: 2.5,
  boot_lid_PDR: 1.5,
  boot_lid_BLEND: 1.0,

  // Roof
  roof_REPAIR: 5.0,
  roof_REPLACE: 8.0,
  roof_PDR: 2.0,
  roof_BLEND: 2.0,

  // Wings
  nearside_front_wing_REPAIR: 3.5,
  nearside_front_wing_REPLACE: 3.0,
  nearside_front_wing_PDR: 1.0,
  nearside_front_wing_BLEND: 1.0,
  offside_front_wing_REPAIR: 3.5,
  offside_front_wing_REPLACE: 3.0,
  offside_front_wing_PDR: 1.0,
  offside_front_wing_BLEND: 1.0,

  // Rear quarters
  nearside_rear_quarter_REPAIR: 5.0,
  nearside_rear_quarter_REPLACE: 8.0,
  nearside_rear_quarter_BLEND: 2.0,
  offside_rear_quarter_REPAIR: 5.0,
  offside_rear_quarter_REPLACE: 8.0,
  offside_rear_quarter_BLEND: 2.0,

  // Doors
  nearside_front_door_REPAIR: 3.5,
  nearside_front_door_REPLACE: 3.0,
  nearside_front_door_PDR: 1.0,
  nearside_front_door_BLEND: 1.0,
  offside_front_door_REPAIR: 3.5,
  offside_front_door_REPLACE: 3.0,
  offside_front_door_PDR: 1.0,
  offside_front_door_BLEND: 1.0,
  nearside_rear_door_REPAIR: 3.5,
  nearside_rear_door_REPLACE: 3.0,
  nearside_rear_door_PDR: 1.0,
  nearside_rear_door_BLEND: 1.0,
  offside_rear_door_REPAIR: 3.5,
  offside_rear_door_REPLACE: 3.0,
  offside_rear_door_PDR: 1.0,
  offside_rear_door_BLEND: 1.0,

  // Sills
  nearside_sill_REPAIR: 2.5,
  nearside_sill_REPLACE: 4.0,
  nearside_sill_BLEND: 1.0,
  offside_sill_REPAIR: 2.5,
  offside_sill_REPLACE: 4.0,
  offside_sill_BLEND: 1.0,

  // Mirrors
  nearside_mirror_REPLACE: 1.0,
  nearside_mirror_SMART_REPAIR: 0.5,
  offside_mirror_REPLACE: 1.0,
  offside_mirror_SMART_REPAIR: 0.5,

  // Lights
  nearside_headlight_REPLACE: 1.0,
  offside_headlight_REPLACE: 1.0,
  nearside_tail_light_REPLACE: 0.75,
  offside_tail_light_REPLACE: 0.75,

  // Glass
  front_windscreen_REPLACE: 1.5,
  rear_windscreen_REPLACE: 2.0,

  // Grille
  grille_REPLACE: 1.0,
  grille_REPAIR: 1.5,

  // Tailgate
  tailgate_REPAIR: 4.0,
  tailgate_REPLACE: 3.0,
  tailgate_PDR: 1.5,
  tailgate_BLEND: 1.5,
};

/** Default labour time if a specific panel+method combo is not found. */
const DEFAULT_LABOUR_TIME = 3.0;

/** Look up labour time for a panel and repair method. */
export function getLabourTime(panelName: string, repairMethod: string): number {
  const key = `${panelName}_${repairMethod}` as LabourTimeKey;
  return TIMES[key] ?? DEFAULT_LABOUR_TIME;
}

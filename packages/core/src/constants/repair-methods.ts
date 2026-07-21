import type { RepairMethod } from '../types/triage';

export interface RepairMethodInfo {
  code: RepairMethod;
  label: string;
  description: string;
}

export const REPAIR_METHOD_INFO: Record<RepairMethod, RepairMethodInfo> = {
  REPAIR: {
    code: 'REPAIR',
    label: 'Panel Repair',
    description: 'Conventional repair including filler, prime, and paint',
  },
  REPLACE: {
    code: 'REPLACE',
    label: 'Panel Replacement',
    description: 'Remove and replace panel with new OEM or aftermarket part',
  },
  BLEND: {
    code: 'BLEND',
    label: 'Blend',
    description: 'Paint blending into adjacent panels for colour match',
  },
  PDR: {
    code: 'PDR',
    label: 'Paintless Dent Repair',
    description: 'Remove dents without affecting paint finish',
  },
  SMART_REPAIR: {
    code: 'SMART_REPAIR',
    label: 'SMART Repair',
    description: 'Small/medium area repair technique for localised damage',
  },
};

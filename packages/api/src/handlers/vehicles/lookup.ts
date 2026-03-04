import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { parseBody } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { z } from 'zod';
import type { Vehicle, VehicleLookupResponse, VehicleSize } from '@corexpert/core';

const lookupSchema = z.object({
  registrationNo: z.string().min(1).max(10),
});

/**
 * Mock vehicle database for MVP.
 * Replace with DVLA API integration in production.
 */
const MOCK_VEHICLES: Record<string, Vehicle> = {
  'AB12CDE': {
    registrationNo: 'AB12CDE',
    make: 'Ford',
    model: 'Focus',
    variant: '1.0 EcoBoost Zetec',
    year: 2020,
    colour: 'Blue',
    vehicleSize: 'MEDIUM' as VehicleSize,
  },
  'XY67FGH': {
    registrationNo: 'XY67FGH',
    make: 'BMW',
    model: '3 Series',
    variant: '320d M Sport',
    year: 2021,
    colour: 'Black',
    vehicleSize: 'LARGE' as VehicleSize,
  },
  'LM34NOP': {
    registrationNo: 'LM34NOP',
    make: 'Vauxhall',
    model: 'Corsa',
    variant: '1.2 SE',
    year: 2019,
    colour: 'Silver',
    vehicleSize: 'SMALL' as VehicleSize,
  },
  'RS56TUV': {
    registrationNo: 'RS56TUV',
    make: 'Volkswagen',
    model: 'Transporter',
    variant: 'T6.1 Highline',
    year: 2022,
    colour: 'White',
    vehicleSize: 'VAN' as VehicleSize,
  },
  'WX78YZA': {
    registrationNo: 'WX78YZA',
    make: 'Toyota',
    model: 'RAV4',
    variant: '2.5 Hybrid Design',
    year: 2023,
    colour: 'Red',
    vehicleSize: 'SUV' as VehicleSize,
  },
};

async function lookupHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { registrationNo } = parseBody(event, lookupSchema);

  // Normalize: strip spaces, uppercase
  const normalized = registrationNo.replace(/\s+/g, '').toUpperCase();

  const vehicle = MOCK_VEHICLES[normalized];

  const response: VehicleLookupResponse = vehicle
    ? { found: true, vehicle }
    : { found: false };

  return ok(response);
}

export const handler = withErrorHandler(lookupHandler);

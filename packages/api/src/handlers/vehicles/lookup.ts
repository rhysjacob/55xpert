import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { parseBody } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { z } from 'zod';
import type { VehicleLookupResponse } from '@corexpert/core';
import { lookupVehicleByVrm, lookupVehicleByVin } from '../../lib/oneautoapi';

const lookupSchema = z
  .object({
    registrationNo: z.string().min(1).max(10).optional(),
    vin: z.string().min(11).max(17).optional(),
  })
  .refine((v) => v.registrationNo || v.vin, {
    message: 'Either registrationNo or vin is required',
  });

/**
 * Vehicle lookup via OneAutoAPI Experian AutoCheck. Returns identity fields
 * (make/model/colour/year/size) plus provenance flags for display.
 */
async function lookupHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { registrationNo, vin } = parseBody(event, lookupSchema);

  const result = registrationNo
    ? await lookupVehicleByVrm(registrationNo.replace(/\s+/g, '').toUpperCase())
    : await lookupVehicleByVin((vin as string).replace(/\s+/g, '').toUpperCase());

  if (!result) {
    logger.info('Vehicle lookup: not found', { registrationNo, hasVin: Boolean(vin) });
    return ok<VehicleLookupResponse>({ found: false });
  }

  return ok<VehicleLookupResponse>({
    found: true,
    vehicle: result.vehicle,
    provenance: result.provenance,
  });
}

export const handler = withErrorHandler(lookupHandler);

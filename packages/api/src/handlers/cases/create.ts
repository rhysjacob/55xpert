import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody } from '../../middleware/validation';
import { created } from '../../lib/response';
import { CasesRepository } from '@corexpert/db';
import { generateCaseReference } from '@corexpert/core';
import type { Case } from '@corexpert/core';

const createSchema = z.object({
  postcode: z.string().min(1).max(10).optional(),
  incidentDate: z.string().optional(),
  incidentNotes: z.string().max(2000).optional(),
  vehicle: z.object({
    registrationNo: z.string().optional(),
    make: z.string().optional(),
    model: z.string().optional(),
    variant: z.string().optional(),
    year: z.number().optional(),
    colour: z.string().optional(),
    vehicleSize: z.enum(['SMALL', 'MEDIUM', 'LARGE', 'VAN', 'SUV']).optional(),
    provenance: z.object({
      isStolen: z.boolean().optional(),
      isScrapped: z.boolean().optional(),
      isWrittenOff: z.boolean().optional(),
      hasOutstandingFinance: z.boolean().optional(),
      isImported: z.boolean().optional(),
      isExported: z.boolean().optional(),
      colourChanged: z.boolean().optional(),
      plateChanged: z.boolean().optional(),
    }).optional(),
  }).optional(),
});

const cases = new CasesRepository();

async function createHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'CONSUMER');

  const body = parseBody(event, createSchema);
  const now = new Date().toISOString();

  // Stamp the tenant (TRX-77). A consumer who signed up through a white-label
  // portal carries their tenant in the JWT (custom:warrantyCompanyId, stamped
  // at signup from the Cognito app client); everyone else falls back to the
  // stage default. Ingested cases carry their warranty company instead. The
  // published job + payment inherit this downstream, so it decides which
  // repairer network sees the job — which is why it is taken from the signed
  // token and never from a hostname, header or request body.
  const defaultTenant = process.env['DEFAULT_WARRANTY_COMPANY_ID'] ?? 'demotenant';
  const tenant = auth.warrantyCompanyId ?? defaultTenant;
  const newCase: Case = {
    caseId: randomUUID(),
    referenceNo: generateCaseReference(),
    userId: auth.userId,
    status: 'DRAFT',
    warrantyCompanyId: tenant,
    postcode: body.postcode,
    incidentDate: body.incidentDate,
    incidentNotes: body.incidentNotes,
    vehicle: body.vehicle,
    images: [],
    xpertReviews: [],
    createdAt: now,
    updatedAt: now,
  };

  await cases.create(newCase);

  return created(newCase);
}

export const handler = withErrorHandler(createHandler);

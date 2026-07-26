import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { ComplaintsRepository, OrganisationsRepository } from '@corexpert/db';
import { NotFoundError } from '@corexpert/core';
import type { Complaint } from '@corexpert/core';

const complaints = new ComplaintsRepository();
const orgs = new OrganisationsRepository();

const createSchema = z.object({
  organisationId: z.string().min(1),
  source: z.enum(['WARRANTY_COMPANY', 'CUSTOMER_DIRECT']),
  note: z.string().min(1).max(4000),
  // Optionally record the assessment immediately; defaults to OPEN (unassessed).
  status: z.enum(['OPEN', 'JUSTIFIED', 'UNJUSTIFIED']).optional(),
  jobId: z.string().max(120).optional(),
  warrantyCompanyId: z.string().max(120).optional(),
});

/** Log a complaint against a repairer (TRX-24). Admin-only. */
async function createComplaintHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');
  const body = parseBody(event, createSchema);

  const org = await orgs.getById(body.organisationId);
  if (!org) throw new NotFoundError('Organisation', body.organisationId);

  const now = new Date().toISOString();
  const status = body.status ?? 'OPEN';
  const complaint: Complaint = {
    complaintId: randomUUID(),
    organisationId: body.organisationId,
    repairerName: org.name,
    source: body.source,
    status,
    note: body.note,
    ...(body.jobId ? { jobId: body.jobId } : {}),
    ...(body.warrantyCompanyId ? { warrantyCompanyId: body.warrantyCompanyId } : {}),
    createdBy: auth.userId,
    createdAt: now,
    updatedAt: now,
    ...(status !== 'OPEN' ? { resolvedAt: now } : {}),
  };
  await complaints.create(complaint);

  logger.info('Complaint logged', { complaintId: complaint.complaintId, organisationId: complaint.organisationId, status });
  return ok({ complaint });
}

export const handler = withErrorHandler(createComplaintHandler);

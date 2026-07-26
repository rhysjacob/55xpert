import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody, getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { ComplaintsRepository } from '@corexpert/db';
import { NotFoundError } from '@corexpert/core';
import type { Complaint } from '@corexpert/core';

const complaints = new ComplaintsRepository();

const updateSchema = z.object({
  // The justified/unjustified assessment (or back to OPEN).
  status: z.enum(['OPEN', 'JUSTIFIED', 'UNJUSTIFIED']).optional(),
  note: z.string().min(1).max(4000).optional(),
});

/** Update a complaint's assessment/note (TRX-24). Admin-only. */
async function updateComplaintHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');

  const complaintId = getPathParam(event, 'complaintId');

  const existing = await complaints.getById(complaintId);
  if (!existing) throw new NotFoundError('Complaint', complaintId);

  const body = parseBody(event, updateSchema);
  const now = new Date().toISOString();

  const patch: Partial<Pick<Complaint, 'status' | 'note' | 'resolvedAt' | 'updatedAt'>> = { updatedAt: now };
  if (body.note !== undefined) patch.note = body.note;
  // Stamp the resolution time when an assessment is made (JUSTIFIED/UNJUSTIFIED);
  // leave it untouched when reopening to OPEN.
  if (body.status !== undefined) {
    patch.status = body.status;
    if (body.status !== 'OPEN') patch.resolvedAt = now;
  }
  await complaints.update(complaintId, patch);

  logger.info('Complaint updated', { complaintId, status: body.status });
  return ok({ complaint: { ...existing, ...patch } });
}

export const handler = withErrorHandler(updateComplaintHandler);

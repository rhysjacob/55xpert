import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody, getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { JobQueriesRepository, UsersRepository } from '@corexpert/db';
import { NotFoundError } from '@corexpert/core';
import type { JobQuery } from '@corexpert/core';
import { sendEmail } from '../../lib/email';
import { expertQueryAnsweredEmail } from '../../lib/email-templates';

const queries = new JobQueriesRepository();
const users = new UsersRepository();

const schema = z.object({
  response: z.string().min(1).max(4000).optional(),
  status: z.enum(['OPEN', 'ANSWERED', 'CLOSED']).optional(),
}).refine((b) => b.response !== undefined || b.status !== undefined, { message: 'Nothing to update' });

/**
 * Xpert/admin responds to (or closes) a repairer's expert query (TRX-57).
 * A response defaults the status to ANSWERED and emails the repairer (best-effort).
 */
async function respondHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN', 'XPERT');
  const queryId = getPathParam(event, 'queryId');

  const existing = await queries.getById(queryId);
  if (!existing) throw new NotFoundError('JobQuery', queryId);

  const body = parseBody(event, schema);
  const now = new Date().toISOString();
  const patch: Partial<Pick<JobQuery, 'status' | 'response' | 'answeredBy' | 'answeredAt' | 'updatedAt'>> = { updatedAt: now };
  if (body.response !== undefined) {
    patch.response = body.response;
    patch.answeredBy = auth.userId;
    patch.answeredAt = now;
    patch.status = body.status ?? 'ANSWERED';
  } else if (body.status !== undefined) {
    patch.status = body.status;
  }
  await queries.update(queryId, patch);
  const updated: JobQuery = { ...existing, ...patch };

  // Let the repairer know an expert replied (best-effort; never blocks).
  if (patch.response) {
    const repairer = await users.getById(existing.repairerId);
    if (repairer?.email) {
      await sendEmail({ to: repairer.email, ...expertQueryAnsweredEmail(updated) }).catch((err) =>
        logger.error('Expert-answer email failed', { queryId, err: String(err) }),
      );
    }
  }

  logger.info('Expert query updated', { queryId, status: patch.status });
  return ok({ query: updated });
}

export const handler = withErrorHandler(respondHandler);

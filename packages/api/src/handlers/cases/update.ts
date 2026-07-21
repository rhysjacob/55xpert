import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody, getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CasesRepository, docClient, TABLES } from '@corexpert/db';
import { NotFoundError, ForbiddenError, ValidationError } from '@corexpert/core';

const updateSchema = z.object({
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
  }).optional(),
});

const cases = new CasesRepository();

async function updateHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'CONSUMER');

  const caseId = getPathParam(event, 'caseId');
  const body = parseBody(event, updateSchema);

  const existing = await cases.getById(caseId);
  if (!existing) {
    throw new NotFoundError('Case', caseId);
  }
  if (existing.userId !== auth.userId) {
    throw new ForbiddenError('Not authorized to modify this case');
  }
  if (existing.status !== 'DRAFT' && existing.status !== 'IMAGES_UPLOADED') {
    throw new ValidationError('Case can only be updated in DRAFT or IMAGES_UPLOADED status');
  }

  const updates: Record<string, unknown> = {};
  if (body.postcode !== undefined) updates['postcode'] = body.postcode;
  if (body.incidentDate !== undefined) updates['incidentDate'] = body.incidentDate;
  if (body.incidentNotes !== undefined) updates['incidentNotes'] = body.incidentNotes;
  if (body.vehicle !== undefined) updates['vehicle'] = body.vehicle;

  // Build DynamoDB update expression
  const expressionParts: string[] = ['#updatedAt = :updatedAt'];
  const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
  const values: Record<string, unknown> = { ':updatedAt': new Date().toISOString() };

  for (const [key, value] of Object.entries(updates)) {
    expressionParts.push(`#${key} = :${key}`);
    names[`#${key}`] = key;
    values[`:${key}`] = value;
  }

  await docClient.send(new UpdateCommand({
    TableName: TABLES.CASES,
    Key: { caseId },
    UpdateExpression: `SET ${expressionParts.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));

  const updated = await cases.getById(caseId);
  return ok(updated);
}

export const handler = withErrorHandler(updateHandler);

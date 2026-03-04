import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getQueryParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { docClient, TABLES, JobsRepository } from '@corexpert/db';
import type { JobStatus } from '@corexpert/core';

const jobs = new JobsRepository();

async function adminJobsHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');

  const status = getQueryParam(event, 'status') as JobStatus | undefined;
  const limit = Number(getQueryParam(event, 'limit', '20'));
  const lastKey = getQueryParam(event, 'cursor');
  const parsedLastKey = lastKey
    ? JSON.parse(Buffer.from(lastKey, 'base64url').toString())
    : undefined;

  if (status) {
    const result = await jobs.listByStatus(status, Math.min(limit, 100), parsedLastKey);
    return ok({
      items: result.items,
      cursor: result.lastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64url')
        : null,
    });
  }

  const result = await docClient.send(new ScanCommand({
    TableName: TABLES.JOBS,
    Limit: Math.min(limit, 100),
    ExclusiveStartKey: parsedLastKey,
  }));

  return ok({
    items: result.Items ?? [],
    cursor: result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url')
      : null,
  });
}

export const handler = withErrorHandler(adminJobsHandler);

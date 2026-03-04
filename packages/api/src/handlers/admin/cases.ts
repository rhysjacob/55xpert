import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ScanCommand, type ScanCommandOutput } from '@aws-sdk/lib-dynamodb';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getQueryParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { CasesRepository, docClient, TABLES } from '@corexpert/db';
import type { CaseStatus } from '@corexpert/core';

const cases = new CasesRepository();

async function adminCasesHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');

  const status = getQueryParam(event, 'status') as CaseStatus | undefined;
  const limit = Number(getQueryParam(event, 'limit', '20'));
  const lastKey = getQueryParam(event, 'cursor');
  const parsedLastKey = lastKey
    ? JSON.parse(Buffer.from(lastKey, 'base64url').toString())
    : undefined;

  if (status) {
    const result = await cases.listByStatus(status, Math.min(limit, 100), parsedLastKey);
    return ok({
      items: result.items,
      cursor: result.lastKey
        ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64url')
        : null,
    });
  }

  // Without status filter, list all recent (scan — acceptable for admin)
  const result = await docClient.send(new ScanCommand({
    TableName: TABLES.CASES,
    Limit: Math.min(limit, 100),
    ExclusiveStartKey: parsedLastKey,
  })) as ScanCommandOutput;

  return ok({
    items: result.Items ?? [],
    cursor: result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url')
      : null,
  });
}

export const handler = withErrorHandler(adminCasesHandler);

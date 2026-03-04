import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getQueryParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { docClient, TABLES } from '@corexpert/db';

async function myJobsHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');

  const limit = Number(getQueryParam(event, 'limit', '20'));

  // Scan jobs table filtering by acceptance.repairerId
  // In a production system, we'd add a GSI for this
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.JOBS,
    IndexName: 'status-publishedAt-index',
    KeyConditionExpression: '#status = :status',
    FilterExpression: 'acceptance.repairerId = :repairerId',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':status': 'ACCEPTED',
      ':repairerId': auth.userId,
    },
    Limit: Math.min(limit, 100),
    ScanIndexForward: false,
  }));

  return ok({
    items: result.Items ?? [],
  });
}

export const handler = withErrorHandler(myJobsHandler);

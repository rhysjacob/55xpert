import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { ok } from '../../lib/response';
import { docClient, TABLES } from '@corexpert/db';

async function dashboardHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');

  // Aggregate counts from each table
  const [casesResult, jobsResult, usersResult, paymentsResult] = await Promise.all([
    docClient.send(new ScanCommand({ TableName: TABLES.CASES, Select: 'COUNT' })),
    docClient.send(new ScanCommand({ TableName: TABLES.JOBS, Select: 'COUNT' })),
    docClient.send(new ScanCommand({ TableName: TABLES.USERS, Select: 'COUNT' })),
    docClient.send(new ScanCommand({ TableName: TABLES.PAYMENTS, Select: 'COUNT' })),
  ]);

  return ok({
    totalCases: casesResult.Count ?? 0,
    totalJobs: jobsResult.Count ?? 0,
    totalUsers: usersResult.Count ?? 0,
    totalPayments: paymentsResult.Count ?? 0,
  });
}

export const handler = withErrorHandler(dashboardHandler);

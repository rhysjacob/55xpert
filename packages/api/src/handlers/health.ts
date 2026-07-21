import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ok } from '../lib/response';

export async function handler(_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  return ok({
    service: 'corexpert-api',
    version: '0.1.0',
    stage: process.env['STAGE'] ?? 'unknown',
    timestamp: new Date().toISOString(),
  });
}

import { createHash, randomBytes } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { WarrantyCompaniesRepository } from '@corexpert/db';
import { UnauthorizedError } from '@corexpert/core';
import type { WarrantyCompany } from '@corexpert/core';

const companies = new WarrantyCompaniesRepository();

/** SHA-256 hex of an ingestion API key — only the hash is ever stored. */
export function hashIngestKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Generate a fresh ingestion API key (shown once) + its hash (stored). */
export function generateIngestKey(): { key: string; hash: string } {
  const key = `rxk_${randomBytes(24).toString('base64url')}`;
  return { key, hash: hashIngestKey(key) };
}

/**
 * Authenticate an inbound ingestion request by its `x-api-key` header and
 * resolve the warranty-company tenant (TRX-14/79). Rejects a missing/unknown
 * key or an inactive company. This is the system-to-system credential — no
 * Cognito, no user — so the route runs without the JWT authorizer.
 */
export async function authenticateIngest(event: APIGatewayProxyEventV2): Promise<WarrantyCompany> {
  const headers = event.headers ?? {};
  const key = headers['x-api-key'] ?? headers['X-Api-Key'];
  if (!key) throw new UnauthorizedError('Missing x-api-key');

  const company = await companies.getByIngestKeyHash(hashIngestKey(key));
  if (!company) throw new UnauthorizedError('Invalid API key');
  if (company.status !== 'ACTIVE') throw new UnauthorizedError('Warranty company is not active');
  return company;
}

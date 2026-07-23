import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { ok } from '../../lib/response';
import { IngestionsRepository } from '@corexpert/db';
import { NotFoundError } from '@corexpert/core';
import { authenticateIngest } from '../../lib/ingest-auth';

const ingestions = new IngestionsRepository();

/**
 * Ingestion feedback for a warranty company (TRX-36). Authenticated by the same
 * API key as submit; scoped to the caller's own tenant. With an `externalRef`
 * query param it returns that job's status + rejection reason; without one it
 * returns the company's recent ingestion feed.
 */
async function statusHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const company = await authenticateIngest(event);
  const externalRef = event.queryStringParameters?.['externalRef'];

  if (externalRef) {
    const record = await ingestions.get(company.warrantyCompanyId, externalRef);
    if (!record) throw new NotFoundError('Ingestion', externalRef);
    return ok({ record });
  }

  return ok({ items: await ingestions.listByCompany(company.warrantyCompanyId) });
}

export const handler = withErrorHandler(statusHandler);

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody, getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { WarrantyCompaniesRepository } from '@corexpert/db';
import { SCHEMES, NotFoundError, ValidationError, ConflictError } from '@corexpert/core';
import type { WarrantyCompany, WarrantyCompanyScheme } from '@corexpert/core';
import { warrantyCompanySchemeSchema } from '../../lib/warranty-scheme-schema';

const companies = new WarrantyCompaniesRepository();

const createSchema = z
  .object({
    name: z.string().min(1),
    /** Optional explicit id (e.g. to match the deploy default WARRANTY_SCHEME). */
    warrantyCompanyId: z.string().min(1).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    /** Seed the ruleset from a hardcoded scheme template… */
    seedFromSchemeId: z.string().min(1).optional(),
    /** …or provide the full ruleset explicitly. */
    scheme: warrantyCompanySchemeSchema.optional(),
  })
  .refine((b) => !!b.seedFromSchemeId !== !!b.scheme, {
    message: 'Provide exactly one of seedFromSchemeId or scheme',
  });

const updateSchema = z
  .object({
    name: z.string().min(1).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    scheme: warrantyCompanySchemeSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'No fields to update' });

/** Copy a hardcoded scheme template's ruleset. Throws if the id is unknown. */
function schemeFromTemplate(id: string): WarrantyCompanyScheme {
  const template = SCHEMES[id];
  if (!template) {
    throw new ValidationError(`Unknown seed scheme "${id}". Known: ${Object.keys(SCHEMES).join(', ')}`);
  }
  return { eligibility: template.eligibility, matrix: template.matrix };
}

/**
 * Admin CRUD for warranty companies (tenants) + their rulesets. The ruleset is
 * validated on write; onboarding a company here makes it usable at runtime with
 * no deploy. Rich editing UI is TRX-76; this is the API foundation.
 */
async function warrantyCompaniesHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');

  const method = event.requestContext.http.method;
  const id = event.pathParameters?.['companyId'];

  // ----- Collection routes -----
  if (!id) {
    if (method === 'GET') {
      return ok({ items: await companies.list() });
    }
    // POST — create/onboard a company.
    const body = parseBody(event, createSchema);
    // body.scheme is zod-validated; its inferred type is looser than
    // WarrantyCompanyScheme (string[] vs readonly PanelName[]), so cast.
    const scheme: WarrantyCompanyScheme = body.scheme
      ? (body.scheme as unknown as WarrantyCompanyScheme)
      : schemeFromTemplate(body.seedFromSchemeId!);
    const now = new Date().toISOString();
    const company: WarrantyCompany = {
      warrantyCompanyId: body.warrantyCompanyId ?? randomUUID(),
      name: body.name,
      status: body.status ?? 'ACTIVE',
      scheme,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await companies.create(company);
    } catch (err) {
      if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
        throw new ConflictError(`Warranty company ${company.warrantyCompanyId} already exists`);
      }
      throw err;
    }
    return ok({ company });
  }

  // ----- Item routes -----
  if (method === 'GET') {
    const company = await companies.getById(getPathParam(event, 'companyId'));
    if (!company) throw new NotFoundError('WarrantyCompany', id);
    return ok({ company });
  }

  // PUT — patch name/status/scheme.
  const body = parseBody(event, updateSchema);
  const existing = await companies.getById(id);
  if (!existing) throw new NotFoundError('WarrantyCompany', id);
  // Bump the matrix version on any ruleset edit (TRX-76) so previously stored
  // quotes stay reproducible against the version they were priced at. Keep the
  // author's base version, append a fresh save stamp.
  if (body.scheme) {
    const base = body.scheme.matrix.version.split('@')[0];
    body.scheme.matrix.version = `${base}@${new Date().toISOString().slice(0, 19)}Z`;
  }
  await companies.update(id, body as Partial<Pick<WarrantyCompany, 'name' | 'status' | 'scheme'>>);
  return ok({ company: await companies.getById(id) });
}

export const handler = withErrorHandler(warrantyCompaniesHandler);

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { LambdaClient, InvokeCommand, InvocationType } from '@aws-sdk/client-lambda';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { parseBody } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { CasesRepository, IngestionsRepository } from '@corexpert/db';
import { generateCaseReference, validateIngestJob } from '@corexpert/core';
import type { Case, CaseImage, IngestionRecord, RejectionReason } from '@corexpert/core';
import { authenticateIngest } from '../../lib/ingest-auth';
import { notifyWarrantyCompany } from '../../lib/warranty-notify';

const cases = new CasesRepository();
const ingestions = new IngestionsRepository();
const lambda = new LambdaClient({});

const imageSchema = z.object({
  imageType: z.enum(['REGISTRATION_PLATE', 'DAMAGE_ANGLE_1', 'DAMAGE_ANGLE_2', 'DAMAGE_ANGLE_3']),
  s3Key: z.string().min(1),
  s3Bucket: z.string().min(1),
});

const ingestSchema = z.object({
  externalRef: z.string().min(1).max(128),
  postcode: z.string().min(1).max(10),
  vehicle: z.object({
    registrationNo: z.string().max(16).optional(),
    make: z.string().max(64).optional(),
    model: z.string().max(64).optional(),
    year: z.number().int().optional(),
    vehicleSize: z.enum(['SMALL', 'MEDIUM', 'LARGE', 'VAN', 'SUV']).optional(),
  }),
  incidentNotes: z.string().max(2000).optional(),
  images: z.array(imageSchema).max(12),
});

/**
 * Warranty-company job ingestion (TRX-14/79). A company's system pushes a job;
 * we authenticate the tenant by API key, validate + dedupe (TRX-5), then either
 * auto-reject with a reason (TRX-9) or create a tenant-stamped case and kick off
 * triage — after which the normal eligibility → publish flow runs, and the
 * published job inherits the company for network-scoped matching.
 *
 * NOTE: this is the CANONICAL contract. Mapping a specific warranty company's
 * real payload (field names, auth handshake, how they deliver images) onto it
 * is TRX-15 — an external dependency, blocked until a first partner's spec
 * exists. Images here reference objects already in our S3 bucket.
 */
async function submitHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const company = await authenticateIngest(event);
  const body = parseBody(event, ingestSchema);
  const now = new Date().toISOString();

  const reject = async (reason: RejectionReason, detail: string, recorded: boolean) => {
    if (recorded) {
      await ingestions.setStatus(company.warrantyCompanyId, body.externalRef, 'REJECTED', {
        rejectionReason: reason,
        rejectionDetail: detail,
      });
    }
    await notifyWarrantyCompany(company, {
      event: 'job.rejected',
      externalRef: body.externalRef,
      reason,
      detail,
    });
    logger.info('Ingested job rejected', { warrantyCompanyId: company.warrantyCompanyId, externalRef: body.externalRef, reason });
    return ok({ externalRef: body.externalRef, status: 'REJECTED', reason, detail });
  };

  // Dedupe: claim the externalRef. A repeat send returns the existing record
  // rather than creating a second case (TRX-5).
  const record: IngestionRecord = {
    warrantyCompanyId: company.warrantyCompanyId,
    externalRef: body.externalRef,
    status: 'ACCEPTED',
    createdAt: now,
    updatedAt: now,
  };
  const claimed = await ingestions.claim(record);
  if (!claimed) {
    const existing = await ingestions.get(company.warrantyCompanyId, body.externalRef);
    return ok({ externalRef: body.externalRef, status: existing?.status ?? 'ACCEPTED', duplicate: true, ...(existing?.caseId ? { caseId: existing.caseId } : {}) });
  }

  // Structural validation (TRX-5) → auto-reject with a stable reason (TRX-9).
  const validation = validateIngestJob(body);
  if (!validation.ok) {
    return reject(validation.reason!, validation.detail ?? '', true);
  }

  // Images must reference our own bucket — never trust an arbitrary bucket name.
  const bucket = process.env['IMAGE_BUCKET'];
  if (bucket && body.images.some((img) => img.s3Bucket !== bucket)) {
    return reject('MISSING_FIELDS', 'images must reference the platform image bucket', true);
  }

  const images: CaseImage[] = body.images.map((img) => ({
    imageType: img.imageType,
    s3Key: img.s3Key,
    s3Bucket: img.s3Bucket,
    uploadedAt: now,
  }));

  const newCase: Case = {
    caseId: randomUUID(),
    referenceNo: generateCaseReference(),
    // Ingested cases have no consumer owner; attribute to the company tenant.
    userId: `warranty:${company.warrantyCompanyId}`,
    status: 'IMAGES_UPLOADED',
    warrantyCompanyId: company.warrantyCompanyId,
    origin: 'INGESTED',
    externalRef: body.externalRef,
    postcode: body.postcode,
    incidentNotes: body.incidentNotes,
    vehicle: body.vehicle,
    images,
    xpertReviews: [],
    createdAt: now,
    updatedAt: now,
  };
  await cases.create(newCase);
  await ingestions.setStatus(company.warrantyCompanyId, body.externalRef, 'ACCEPTED', { caseId: newCase.caseId });

  // Fire triage asynchronously (same worker as the consumer flow).
  const workerFunction = process.env['TRIAGE_WORKER_FUNCTION'];
  if (workerFunction) {
    await cases.updateStatus(newCase.caseId, 'TRIAGE_PENDING');
    await lambda.send(
      new InvokeCommand({
        FunctionName: workerFunction,
        InvocationType: InvocationType.Event,
        Payload: Buffer.from(JSON.stringify({ caseId: newCase.caseId })),
      }),
    );
  }

  logger.info('Ingested job accepted', { warrantyCompanyId: company.warrantyCompanyId, externalRef: body.externalRef, caseId: newCase.caseId });
  return ok({ externalRef: body.externalRef, status: 'ACCEPTED', caseId: newCase.caseId });
}

export const handler = withErrorHandler(submitHandler);

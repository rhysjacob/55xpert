import { randomUUID } from 'node:crypto';
import { CasesRepository, JobsRepository, WarrantyCompaniesRepository, IngestionsRepository } from '@corexpert/db';
import { ValidationError } from '@corexpert/core';
import type { Case, Job, CaseStatus } from '@corexpert/core';
import { logger } from './logger';
import { notifyWarrantyCompany } from './warranty-notify';
import { geocodePostcode } from './geocode';

const INTRODUCTION_FEE = Number(process.env['INTRODUCTION_FEE'] ?? '2500');
const JOB_EXPIRY_DAYS = 7;
// Ingested (warranty-company) jobs expire faster — 48h — so unmatched work is
// handed back to the company promptly (TRX-10).
const INGESTED_JOB_EXPIRY_HOURS = 48;

const cases = new CasesRepository();
const jobs = new JobsRepository();
const warrantyCompanies = new WarrantyCompaniesRepository();
const ingestions = new IngestionsRepository();

/**
 * Publish a case to The Repair Xchange: creates an OPEN job that repairers
 * can see/accept, and moves the case to PUBLISHED status.
 *
 * Shared by the consumer-driven publish handler and the Xpert review handler
 * (auto-publish on approval). Idempotent guard: throws if a job already exists
 * for the case.
 */
export async function publishJobForCase(caseData: Case): Promise<Job> {
  if (!caseData.triageResult) {
    throw new ValidationError('Triage must be complete before publishing');
  }

  const existing = await jobs.getByCaseId(caseData.caseId);
  if (existing) {
    return existing;
  }

  const now = new Date();
  const expiryMs = caseData.origin === 'INGESTED'
    ? INGESTED_JOB_EXPIRY_HOURS * 60 * 60 * 1000
    : JOB_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(now.getTime() + expiryMs);

  // Extract unique repair methods from triage panels
  const repairMethods = [...new Set(
    caseData.triageResult.panels.map((p) => p.repairMethod),
  )];

  // Geocode the job location (best-effort) so matching can rank by real distance.
  const coords = caseData.postcode ? await geocodePostcode(caseData.postcode) : null;

  const job: Job = {
    jobId: randomUUID(),
    caseId: caseData.caseId,
    status: 'OPEN',
    publishedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    introductionFee: INTRODUCTION_FEE,
    location: {
      postcode: caseData.postcode ?? '',
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    },
    vehicleSummary: {
      make: caseData.vehicle?.make ?? '',
      model: caseData.vehicle?.model ?? '',
      year: caseData.vehicle?.year,
      vehicleSize: caseData.vehicle?.vehicleSize ?? 'MEDIUM',
    },
    damageSummary: caseData.triageResult.summary,
    repairMethods,
    indicativeCost: caseData.triageResult.totalEstimatedCost,
    notificationsSent: 0,
    createdAt: now.toISOString(),
    // Inherit the case's tenant so matching can scope to its network (TRX-78).
    ...(caseData.warrantyCompanyId ? { warrantyCompanyId: caseData.warrantyCompanyId } : {}),
  };

  await jobs.create(job);
  await cases.updateStatus(caseData.caseId, 'PUBLISHED' as CaseStatus);

  // Ingested jobs: mark the ingestion PUBLISHED and tell the company (TRX-36).
  if (caseData.origin === 'INGESTED' && caseData.warrantyCompanyId && caseData.externalRef) {
    await ingestions.setStatus(caseData.warrantyCompanyId, caseData.externalRef, 'PUBLISHED', { caseId: caseData.caseId });
    const company = await warrantyCompanies.getById(caseData.warrantyCompanyId);
    if (company) {
      await notifyWarrantyCompany(company, {
        event: 'job.published',
        externalRef: caseData.externalRef,
        caseId: caseData.caseId,
        jobId: job.jobId,
      });
    }
  }

  logger.info('Job published', { jobId: job.jobId, caseId: caseData.caseId });

  return job;
}

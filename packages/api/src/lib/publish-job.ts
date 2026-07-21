import { randomUUID } from 'node:crypto';
import { CasesRepository, JobsRepository } from '@corexpert/db';
import { ValidationError } from '@corexpert/core';
import type { Case, Job, CaseStatus } from '@corexpert/core';
import { logger } from './logger';

const INTRODUCTION_FEE = Number(process.env['INTRODUCTION_FEE'] ?? '2500');
const JOB_EXPIRY_DAYS = 7;

const cases = new CasesRepository();
const jobs = new JobsRepository();

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
  const expiresAt = new Date(now.getTime() + JOB_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // Extract unique repair methods from triage panels
  const repairMethods = [...new Set(
    caseData.triageResult.panels.map((p) => p.repairMethod),
  )];

  const job: Job = {
    jobId: randomUUID(),
    caseId: caseData.caseId,
    status: 'OPEN',
    publishedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    introductionFee: INTRODUCTION_FEE,
    location: {
      postcode: caseData.postcode ?? '',
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
  };

  await jobs.create(job);
  await cases.updateStatus(caseData.caseId, 'PUBLISHED' as CaseStatus);

  logger.info('Job published', { jobId: job.jobId, caseId: caseData.caseId });

  return job;
}

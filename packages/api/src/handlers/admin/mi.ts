import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getQueryParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { TABLES } from '@corexpert/db';
import type { Case, Job, User } from '@corexpert/core';
import { scanAll, monthKey, hoursBetween, last12Months } from '../../lib/mi-util';

/**
 * Portfolio MI for admin (TRX-25/26/28/29): the job funnel, a rolling 12-month
 * trend, average time-to-accept, financial value processed + platform fee
 * earned, and repairer leaderboards (volume + speed). Aggregated in-memory from
 * full table scans — fine at current cardinality; move to pre-aggregation if
 * the tables grow large.
 *
 * `?warrantyCompanyId=` scopes every metric to one warranty company's
 * tenant-stamped cases + jobs (TRX-31) — omit for the whole portfolio.
 */
async function miHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');

  const companyId = getQueryParam(event, 'warrantyCompanyId');

  const nowIso = new Date().toISOString();
  const [allCases, allJobs, users] = await Promise.all([
    scanAll<Pick<Case, 'status' | 'createdAt' | 'warrantyCompanyId'>>(TABLES.CASES, '#s, createdAt, warrantyCompanyId', { '#s': 'status' }),
    scanAll<Job>(TABLES.JOBS, '#s, publishedAt, acceptance, introductionFee, indicativeCost, warrantyCompanyId', { '#s': 'status' }),
    scanAll<Pick<User, 'userId' | 'firstName' | 'lastName' | 'role' | 'repairer'>>(TABLES.USERS, 'userId, firstName, lastName, #r, repairer', { '#r': 'role' }),
  ]);

  // Per-company scope (TRX-31): only that company's tenant-stamped data.
  const cases = companyId ? allCases.filter((c) => c.warrantyCompanyId === companyId) : allCases;
  const jobs = companyId ? allJobs.filter((j) => j.warrantyCompanyId === companyId) : allJobs;

  // ----- Funnel -----
  const notTriaged = new Set(['DRAFT', 'IMAGES_UPLOADED', 'TRIAGE_PENDING', 'TRIAGE_FAILED']);
  const funnel = {
    received: cases.length,
    processed: cases.filter((c) => !notTriaged.has(c.status)).length,
    referred: cases.filter((c) => c.status === 'XPERT_REVIEW').length,
    rejected: cases.filter((c) => c.status === 'INELIGIBLE').length,
    published: jobs.length,
    open: jobs.filter((j) => j.status === 'OPEN').length,
    accepted: jobs.filter((j) => !!j.acceptance).length,
    expired: jobs.filter((j) => j.status === 'EXPIRED').length,
    completed: jobs.filter((j) => j.status === 'COMPLETED').length,
  };

  // ----- 12-month trend -----
  const months = last12Months(nowIso);
  const idx = new Map(months.map((m, i) => [m, i]));
  const trend = months.map((month) => ({ month, received: 0, published: 0, accepted: 0 }));
  for (const c of cases) { const i = idx.get(monthKey(c.createdAt) ?? ''); if (i != null) trend[i]!.received += 1; }
  for (const j of jobs) {
    const pi = idx.get(monthKey(j.publishedAt) ?? ''); if (pi != null) trend[pi]!.published += 1;
    const ai = idx.get(monthKey(j.acceptance?.acceptedAt) ?? ''); if (ai != null) trend[ai]!.accepted += 1;
  }

  // ----- Time-to-accept + leaderboards -----
  const perRepairer = new Map<string, { accepted: number; totalHours: number }>();
  let ttaSum = 0;
  let ttaCount = 0;
  for (const j of jobs) {
    if (!j.acceptance?.acceptedAt || !j.publishedAt) continue;
    const hrs = hoursBetween(j.publishedAt, j.acceptance.acceptedAt);
    if (hrs < 0) continue;
    ttaSum += hrs; ttaCount += 1;
    const r = perRepairer.get(j.acceptance.repairerId) ?? { accepted: 0, totalHours: 0 };
    r.accepted += 1; r.totalHours += hrs;
    perRepairer.set(j.acceptance.repairerId, r);
  }

  const nameFor = (id: string): string => {
    const u = users.find((x) => x.userId === id);
    return u?.repairer?.businessName || [u?.firstName, u?.lastName].filter(Boolean).join(' ') || id.slice(0, 8);
  };
  const rows = [...perRepairer.entries()].map(([repairerId, r]) => ({
    repairerId,
    name: nameFor(repairerId),
    accepted: r.accepted,
    avgHours: Math.round((r.totalHours / r.accepted) * 10) / 10,
  }));

  const leaderboards = {
    byVolume: [...rows].sort((a, b) => b.accepted - a.accepted).slice(0, 10),
    // Speed leaderboard only ranks repairers with a few accepts (avoids a 1-job fluke topping it).
    bySpeed: rows.filter((r) => r.accepted >= 2).sort((a, b) => a.avgHours - b.avgHours).slice(0, 10),
  };

  // ----- Financial -----
  const financial = {
    estimatedRepairValuePence: jobs.reduce((s, j) => s + (j.indicativeCost ?? 0), 0),
    platformFeeEarnedPence: jobs.filter((j) => !!j.acceptance).reduce((s, j) => s + (j.introductionFee ?? 0), 0),
  };

  return ok({
    funnel,
    trend,
    timeToAccept: { avgHours: ttaCount ? Math.round((ttaSum / ttaCount) * 10) / 10 : null, sampleSize: ttaCount },
    financial,
    leaderboards,
    repairerCount: users.filter((u) => u.role === 'REPAIRER').length,
    ...(companyId ? { warrantyCompanyId: companyId } : {}),
    generatedAt: nowIso,
  });
}

export const handler = withErrorHandler(miHandler);

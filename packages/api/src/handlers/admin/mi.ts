import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole, tenantScope } from '../../middleware/auth';
import { getQueryParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { TABLES } from '@corexpert/db';
import type { Case, Job, User, Complaint } from '@corexpert/core';
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

  // Central tenant scope (TRX-77): admin/Xpert may filter to any company (or
  // none); a company-facing user is forced to their own tenant and can't widen it.
  const companyId = tenantScope(auth) ?? getQueryParam(event, 'warrantyCompanyId');

  const nowIso = new Date().toISOString();
  const [allCases, allJobs, users, allComplaints] = await Promise.all([
    scanAll<Pick<Case, 'status' | 'createdAt' | 'warrantyCompanyId'>>(TABLES.CASES, '#s, createdAt, warrantyCompanyId', { '#s': 'status' }),
    scanAll<Job>(TABLES.JOBS, '#s, publishedAt, acceptance, introductionFee, indicativeCost, warrantyCompanyId', { '#s': 'status' }),
    scanAll<Pick<User, 'userId' | 'firstName' | 'lastName' | 'role' | 'repairer' | 'organisationId'>>(TABLES.USERS, 'userId, firstName, lastName, #r, repairer, organisationId', { '#r': 'role' }),
    scanAll<Complaint>(TABLES.COMPLAINTS, 'complaintId, organisationId, repairerName, #st, warrantyCompanyId', { '#st': 'status' }),
  ]);

  // Per-company scope (TRX-31): only that company's tenant-stamped data.
  const cases = companyId ? allCases.filter((c) => c.warrantyCompanyId === companyId) : allCases;
  const jobs = companyId ? allJobs.filter((j) => j.warrantyCompanyId === companyId) : allJobs;
  const complaints = companyId ? allComplaints.filter((c) => c.warrantyCompanyId === companyId) : allComplaints;

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

  // ----- Complaints vs volume (TRX-27) -----
  // Complaints are logged against an ORG; job volume is per accepting user, so
  // map user → org to attribute accepted jobs to the same org as its complaints.
  const userToOrg = new Map(users.filter((u) => u.organisationId).map((u) => [u.userId, u.organisationId!]));
  const acceptedByOrg = new Map<string, number>();
  for (const j of jobs) {
    const uid = j.acceptance?.repairerId;
    const org = uid ? userToOrg.get(uid) : undefined;
    if (org) acceptedByOrg.set(org, (acceptedByOrg.get(org) ?? 0) + 1);
  }

  const perOrg = new Map<string, { name: string; total: number; justified: number; unjustified: number; open: number }>();
  for (const c of complaints) {
    const row = perOrg.get(c.organisationId) ?? { name: c.repairerName || c.organisationId.slice(0, 8), total: 0, justified: 0, unjustified: 0, open: 0 };
    row.total += 1;
    if (c.status === 'JUSTIFIED') row.justified += 1;
    else if (c.status === 'UNJUSTIFIED') row.unjustified += 1;
    else row.open += 1;
    perOrg.set(c.organisationId, row);
  }

  const totalAccepted = jobs.filter((j) => !!j.acceptance).length;
  const justifiedTotal = complaints.filter((c) => c.status === 'JUSTIFIED').length;
  const complaintsByRepairer = [...perOrg.entries()].map(([organisationId, r]) => ({
    organisationId,
    name: r.name,
    complaints: r.total,
    justified: r.justified,
    unjustified: r.unjustified,
    open: r.open,
    accepted: acceptedByOrg.get(organisationId) ?? 0,
  })).sort((a, b) => b.justified - a.justified || b.complaints - a.complaints);

  const complaintsMi = {
    total: complaints.length,
    justified: justifiedTotal,
    unjustified: complaints.filter((c) => c.status === 'UNJUSTIFIED').length,
    open: complaints.filter((c) => c.status === 'OPEN').length,
    acceptedJobs: totalAccepted,
    // Justified complaints as a % of accepted jobs — the headline quality signal.
    justifiedRatePct: totalAccepted ? Math.round((justifiedTotal / totalAccepted) * 1000) / 10 : null,
    byRepairer: complaintsByRepairer,
  };

  return ok({
    funnel,
    trend,
    timeToAccept: { avgHours: ttaCount ? Math.round((ttaSum / ttaCount) * 10) / 10 : null, sampleSize: ttaCount },
    financial,
    leaderboards,
    complaints: complaintsMi,
    repairerCount: users.filter((u) => u.role === 'REPAIRER').length,
    ...(companyId ? { warrantyCompanyId: companyId } : {}),
    generatedAt: nowIso,
  });
}

export const handler = withErrorHandler(miHandler);

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { ok } from '../../lib/response';
import { docClient, TABLES } from '@corexpert/db';
import type { Case, Job, User } from '@corexpert/core';

/** Scan every item of a table (paged), projecting the given attributes. */
async function scanAll<T>(table: string, projection: string, names?: Record<string, string>): Promise<T[]> {
  const items: T[] = [];
  let key: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(new ScanCommand({
      TableName: table,
      ProjectionExpression: projection,
      ...(names ? { ExpressionAttributeNames: names } : {}),
      ExclusiveStartKey: key,
    }));
    items.push(...((res.Items ?? []) as T[]));
    key = res.LastEvaluatedKey;
  } while (key);
  return items;
}

const monthKey = (iso?: string): string | undefined => (iso ? iso.slice(0, 7) : undefined);
const hoursBetween = (a: string, b: string): number => (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;

/** The last 12 calendar months as YYYY-MM keys, oldest → newest, from a base date. */
function last12Months(nowIso: string): string[] {
  const [y, m] = nowIso.slice(0, 7).split('-').map(Number);
  const out: string[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y!, m! - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/**
 * Portfolio MI for admin (TRX-25/26/28/29): the job funnel, a rolling 12-month
 * trend, average time-to-accept, financial value processed + platform fee
 * earned, and repairer leaderboards (volume + speed). Aggregated in-memory from
 * full table scans — fine at current cardinality; move to pre-aggregation if
 * the tables grow large. `now` is passed in (tests/repro) or defaults to the
 * request time.
 */
async function miHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');

  const nowIso = new Date().toISOString();
  const [cases, jobs, users] = await Promise.all([
    scanAll<Pick<Case, 'status' | 'createdAt'>>(TABLES.CASES, '#s, createdAt', { '#s': 'status' }),
    scanAll<Job>(TABLES.JOBS, '#s, publishedAt, acceptance, introductionFee, indicativeCost', { '#s': 'status' }),
    scanAll<Pick<User, 'userId' | 'firstName' | 'lastName' | 'role' | 'repairer'>>(TABLES.USERS, 'userId, firstName, lastName, #r, repairer', { '#r': 'role' }),
  ]);

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
    generatedAt: nowIso,
  });
}

export const handler = withErrorHandler(miHandler);

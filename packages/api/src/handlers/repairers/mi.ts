import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { ok } from '../../lib/response';
import { UsersRepository, TABLES } from '@corexpert/db';
import { evaluateMatch } from '@corexpert/core';
import type { Job } from '@corexpert/core';
import { resolveMatchTarget, jobToMatchInput } from '../../lib/matching';
import { scanAll, monthKey, hoursBetween, last12Months } from '../../lib/mi-util';

const users = new UsersRepository();

/**
 * A repairer's own MI (TRX-67) — the same shape as the admin view, scoped to
 * them: jobs accepted, average time to accept, repair value handled and match
 * fees paid, a 12-month accept trend, plus how many open jobs match them right
 * now (via the live matching engine).
 */
async function repairerMiHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');

  const nowIso = new Date().toISOString();
  const user = await users.getById(auth.userId);
  const target = user ? await resolveMatchTarget(user) : null;

  const jobs = await scanAll<Job>(
    TABLES.JOBS,
    '#s, publishedAt, acceptance, introductionFee, indicativeCost, #loc, vehicleSummary, repairMethods, warrantyCompanyId',
    { '#s': 'status', '#loc': 'location' },
  );

  const mine = jobs.filter((j) => j.acceptance?.repairerId === auth.userId);

  // Accept trend (last 12 months) + time-to-accept.
  const months = last12Months(nowIso);
  const idx = new Map(months.map((m, i) => [m, i]));
  const trend = months.map((month) => ({ month, accepted: 0 }));
  let ttaSum = 0;
  let ttaCount = 0;
  for (const j of mine) {
    const ai = idx.get(monthKey(j.acceptance?.acceptedAt) ?? '');
    if (ai != null) trend[ai]!.accepted += 1;
    if (j.acceptance?.acceptedAt && j.publishedAt) {
      const hrs = hoursBetween(j.publishedAt, j.acceptance.acceptedAt);
      if (hrs >= 0) { ttaSum += hrs; ttaCount += 1; }
    }
  }

  // How many open jobs match this repairer right now.
  const availableNow = target
    ? jobs.filter((j) => j.status === 'OPEN' && evaluateMatch(jobToMatchInput(j), target).matched).length
    : 0;

  return ok({
    accepted: mine.length,
    availableNow,
    timeToAccept: { avgHours: ttaCount ? Math.round((ttaSum / ttaCount) * 10) / 10 : null, sampleSize: ttaCount },
    financial: {
      repairValueHandledPence: mine.reduce((s, j) => s + (j.indicativeCost ?? 0), 0),
      matchFeesPaidPence: mine.reduce((s, j) => s + (j.introductionFee ?? 0), 0),
    },
    trend,
    generatedAt: nowIso,
  });
}

export const handler = withErrorHandler(repairerMiHandler);

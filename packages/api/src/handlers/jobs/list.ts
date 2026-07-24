import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getQueryParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { UsersRepository, JobsRepository } from '@corexpert/db';
import { evaluateMatch, compareByMatch } from '@corexpert/core';
import type { Job } from '@corexpert/core';
import { resolveMatchTarget, jobToMatchInput } from '../../lib/matching';

const users = new UsersRepository();
const jobs = new JobsRepository();

// How many OPEN jobs to scan before matching. At MVP cardinality a single wide
// window covers the whole open pool; matching then filters it to this repairer.
const OPEN_SCAN = 200;
// Recently-taken jobs shown greyed-out (TRX-53) so a repairer sees a job vanish
// to a faster finger rather than have it silently disappear.
const TAKEN_WINDOW = 25;

/**
 * The jobs available to the calling repairer — filtered by the matching engine
 * (network scope, capability, coverage with nearest-area fallback) and ranked
 * by proximity (TRX-11/12/13/78). Jobs an admin has pushed to the repairer's
 * org are always included (TRX-20). Recently-accepted matches are returned
 * flagged `taken` so the UI can grey them out (TRX-53).
 */
async function listHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');

  const limit = Math.min(Number(getQueryParam(event, 'limit', '20')), 100);

  const user = await users.getById(auth.userId);
  const target = user ? await resolveMatchTarget(user) : null;
  // No usable target (missing profile, or suspended/pending org) → nothing to show.
  if (!target) return ok({ items: [], cursor: null });

  const [open, taken] = await Promise.all([
    jobs.listByStatus('OPEN', OPEN_SCAN),
    jobs.listByStatus('ACCEPTED', TAKEN_WINDOW),
  ]);

  const pushedToMe = (job: Job): boolean =>
    !!target.organisationId && (job.pushedOrganisationIds ?? []).includes(target.organisationId);

  const consider = (job: Job, isTaken: boolean) => {
    const result = evaluateMatch(jobToMatchInput(job), target);
    const matched = result.matched || pushedToMe(job);
    if (!matched) return null;
    return {
      job,
      taken: isTaken,
      // A pushed-but-unmatched job still ranks, treated as an exact hit.
      exact: result.matched ? result.exact : true,
      proximity: result.matched ? result.proximity : 1,
      ...(result.distanceKm != null ? { distanceKm: result.distanceKm } : {}),
    };
  };

  const matchedOpen = open.items.map((j) => consider(j, false)).filter((x) => x !== null);
  const matchedTaken = taken.items.map((j) => consider(j, true)).filter((x) => x !== null);

  // Open jobs first (ranked), then the greyed-out taken ones.
  matchedOpen.sort((a, b) => compareByMatch(
    { exact: a.exact, proximity: a.proximity, distanceKm: a.distanceKm, publishedAt: a.job.publishedAt },
    { exact: b.exact, proximity: b.proximity, distanceKm: b.distanceKm, publishedAt: b.job.publishedAt },
  ));

  const items = [...matchedOpen, ...matchedTaken].slice(0, limit).map(({ job, taken: isTaken, exact, distanceKm }) => ({
    jobId: job.jobId,
    status: job.status,
    taken: isTaken,
    matchType: exact ? 'exact' : 'nearby',
    // Rounded miles for display when the job is geocoded.
    ...(distanceKm != null ? { distanceMiles: Math.round((distanceKm / 1.60934) * 10) / 10 } : {}),
    publishedAt: job.publishedAt,
    expiresAt: job.expiresAt,
    introductionFee: job.introductionFee,
    location: { postcode: job.location?.postcode },
    vehicleSummary: job.vehicleSummary,
    damageSummary: job.damageSummary,
    repairMethods: job.repairMethods,
    indicativeCost: job.indicativeCost,
  }));

  // Matching filters the whole open window in one pass, so there is no server
  // cursor to continue at current scale (documented; revisit with a
  // by-region/by-org GSI if the open pool grows large).
  return ok({ items, cursor: null });
}

export const handler = withErrorHandler(listHandler);

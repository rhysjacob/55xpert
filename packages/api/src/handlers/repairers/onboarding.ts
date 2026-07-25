import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { UsersRepository, OrganisationsRepository } from '@corexpert/db';
import { NotFoundError, normalisePostcode } from '@corexpert/core';
import { geocodePostcode } from '../../lib/geocode';
import type { RepairerOrganisation, RepairerOnboarding, RepairerCapability } from '@corexpert/core';

const users = new UsersRepository();
const orgs = new OrganisationsRepository();

const MILES_TO_KM = 1.60934;

const mobileUnitsSchema = z.object({
  count: z.number().int().min(0).max(50),
  equipment: z.array(z.string().max(60)).max(20),
  equipmentOther: z.string().max(200).optional(),
  fullyEquipped: z.boolean().optional(),
  yearRound: z.boolean().optional(),
  needsDriveway: z.boolean().optional(),
  carParkRoadside: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
});

const onboardingSchema = z.object({
  // Section A — business basics
  businessName: z.string().min(1).max(120),
  contactName: z.string().max(120).optional(),
  phone: z.string().max(32).optional(),
  businessType: z.enum(['Independent Repairer', 'Mobile Repairer', 'Group / Multi-site', 'Specialist']),
  // Section B — coverage
  coverageAreas: z.array(z.string().min(1).max(8)).min(1).max(200),
  travelRadiusMiles: z.number().int().min(0).max(100).optional(),
  /** Base / business postcode — geocoded to anchor the travel radius + map marker. */
  basePostcode: z.string().min(1).max(10).optional(),
  // Section C — capabilities
  services: z.array(z.enum(['SMART', 'BODYSHOP', 'ALLOY', 'GLASS', 'EV', 'ADAS', 'COSMETIC', 'STRUCTURAL', 'MOBILE', 'PAINT'])).max(20),
  // Section D — operational
  preferredJobTypes: z.array(z.string().max(60)).max(30).default([]),
  dailyCapacity: z.number().int().min(1).max(10).optional(),
  capsEnabled: z.boolean().optional(),
  capsId: z.string().max(60).optional(),
  // Section E — mobile units
  mobileUnits: mobileUnitsSchema.optional(),
  // Section F — confirmation
  accuracyConfirmed: z.literal(true),
  termsAccepted: z.literal(true),
});

/**
 * Complete repairer onboarding (spreadsheet "Repairer Onboarding Build Spec").
 * Saves business details, coverage, capabilities and operational answers to the
 * repairer's organisation — mirroring coverage/radius/services onto the matching
 * capability — records T&Cs acceptance, and activates a PENDING org so the
 * repairer starts being matched. The credit-card step is the separate Stripe
 * subscription flow (POST /repairer/subscription); job acceptance still gates on
 * an active subscription.
 */
async function onboardingHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');

  const user = await users.getById(auth.userId);
  if (!user) throw new NotFoundError('User', auth.userId);
  const body = parseBody(event, onboardingSchema);
  const now = new Date().toISOString();

  // Ensure an organisation exists (new signups have one; backfill legacy accounts).
  let org: RepairerOrganisation | undefined;
  if (user.organisationId) org = await orgs.getById(user.organisationId);
  if (!org) {
    org = {
      organisationId: randomUUID(),
      name: body.businessName,
      status: 'PENDING',
      capability: { vehicleSizes: [], repairMethods: [], coverageAreas: [] },
      primaryContactUserId: user.userId,
      createdAt: now,
      updatedAt: now,
    };
    await orgs.create(org);
    await users.update(user.userId, { organisationId: org.organisationId });
  }

  // Coverage + radius + services flow onto the matching capability.
  const coverageAreas = [...new Set(body.coverageAreas.map(normalisePostcode).filter(Boolean))];
  // Geocode the base postcode (best-effort) to anchor the radius + map marker.
  const baseCoords = body.basePostcode ? await geocodePostcode(body.basePostcode) : null;
  const capability: RepairerCapability = {
    ...org.capability,
    coverageAreas,
    services: body.services,
    ...(body.travelRadiusMiles ? { coverageRadiusKm: Math.round(body.travelRadiusMiles * MILES_TO_KM) } : {}),
    ...(body.basePostcode ? { basePostcode: normalisePostcode(body.basePostcode) } : {}),
    ...(baseCoords ? { baseLat: baseCoords.lat, baseLng: baseCoords.lng } : {}),
  };

  const onboarding: RepairerOnboarding = {
    preferredJobTypes: body.preferredJobTypes ?? [],
    accuracyConfirmed: true,
    termsAcceptedAt: now,
    completedAt: now,
    ...(body.travelRadiusMiles != null ? { travelRadiusMiles: body.travelRadiusMiles } : {}),
    ...(body.dailyCapacity != null ? { dailyCapacity: body.dailyCapacity } : {}),
    ...(body.capsEnabled != null ? { capsEnabled: body.capsEnabled } : {}),
    ...(body.capsId ? { capsId: body.capsId } : {}),
    ...(body.mobileUnits ? { mobileUnits: body.mobileUnits } : {}),
  };

  await orgs.update(org.organisationId, {
    name: body.businessName,
    businessType: body.businessType,
    capability,
    onboarding,
    // Activate a pending org on completion (per the brief). Don't override an
    // admin SUSPENDED/DISABLED standing.
    ...(org.status === 'PENDING' ? { status: 'ACTIVE' as const } : {}),
  });

  // Keep the repairer's own profile in step (business name / contact / phone).
  if (user.repairer) {
    await users.update(user.userId, {
      repairer: {
        ...user.repairer,
        businessName: body.businessName,
        ...(body.contactName ? { contactName: body.contactName } : {}),
        ...(body.phone ? { phone: body.phone } : {}),
      },
    });
  }

  logger.info('Repairer onboarding completed', { userId: user.userId, organisationId: org.organisationId });
  return ok({
    organisationId: org.organisationId,
    onboardingComplete: true,
    // Next step: capture the card via the Stripe subscription flow.
    nextStep: 'subscription',
  });
}

export const handler = withErrorHandler(onboardingHandler);

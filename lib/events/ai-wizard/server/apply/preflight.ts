import { and, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { eventDistances, eventEditions, pricingTiers } from '@/db/schema';
import { normalizeEditionDateTimeForPersistence } from '@/lib/events/datetime';
import { findConflictingPricingTier } from '@/lib/events/pricing/contracts';

import type {
  EventAiWizardApplyEvent,
  EventAiWizardApplyPatch,
  EventAiWizardPreflightFailure,
  PolicyState,
} from './types';

const ambiguousClockOnlyTimePattern = /^\d{1,2}(?::\d{2})?\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)$/i;

export function resolvePriceCents(data: { priceCents?: number; price?: number }): number {
  if (data.priceCents !== undefined) return data.priceCents;
  const price = data.price ?? 0;
  return Math.round(price * 100);
}

export function normalizeIsoDateTime(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function normalizeDistanceStartTimeLocal(
  value: string | null | undefined,
): string | undefined | null {
  if (value == null) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (ambiguousClockOnlyTimePattern.test(trimmed)) return undefined;

  return normalizeIsoDateTime(trimmed);
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

export function normalizeLocalDateTime(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;

  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}T${pad2(
    date.getUTCHours(),
  )}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
}

export function appendMarkdown(existing: string | null | undefined, incoming: string): string {
  const previous = (existing ?? '').trim();
  const next = incoming.trim();

  if (!previous) return next;
  if (!next) return previous;
  if (previous.includes(next)) return previous;
  return `${previous}\n\n${next}`;
}

export function initializePolicyState(event: EventAiWizardApplyEvent): PolicyState {
  return {
    refundsAllowed: event.policyConfig?.refundsAllowed ?? false,
    refundPolicyText: event.policyConfig?.refundPolicyText ?? null,
    refundDeadline: event.policyConfig?.refundDeadline?.toISOString() ?? null,
    transfersAllowed: event.policyConfig?.transfersAllowed ?? false,
    transferPolicyText: event.policyConfig?.transferPolicyText ?? null,
    transferDeadline: event.policyConfig?.transferDeadline?.toISOString() ?? null,
    deferralsAllowed: event.policyConfig?.deferralsAllowed ?? false,
    deferralPolicyText: event.policyConfig?.deferralPolicyText ?? null,
    deferralDeadline: event.policyConfig?.deferralDeadline?.toISOString() ?? null,
  };
}

export function collectReferencedDistanceIds(patch: EventAiWizardApplyPatch): string[] {
  return Array.from(
    new Set(
      patch.ops
        .flatMap((op) => {
          if (op.type === 'update_distance_price' || op.type === 'create_pricing_tier') {
            return [op.distanceId];
          }
          if (op.type === 'create_question' || op.type === 'create_add_on') {
            return op.data.distanceId ? [op.data.distanceId] : [];
          }
          return [];
        })
        .filter((id): id is string => typeof id === 'string'),
    ),
  );
}

export async function validateReferencedDistanceIds(params: {
  editionId: string;
  patch: EventAiWizardApplyPatch;
}): Promise<EventAiWizardPreflightFailure | null> {
  const referencedDistanceIds = collectReferencedDistanceIds(params.patch);

  if (!referencedDistanceIds.length) {
    return null;
  }

  const rows = await db
    .select({ id: eventDistances.id })
    .from(eventDistances)
    .where(
      and(
        eq(eventDistances.editionId, params.editionId),
        isNull(eventDistances.deletedAt),
        inArray(eventDistances.id, referencedDistanceIds),
      ),
    );

  const allowed = new Set(rows.map((row) => row.id));
  const invalid = referencedDistanceIds.find((id) => !allowed.has(id));
  if (!invalid) {
    return null;
  }

  return {
    code: 'INVALID_DISTANCE',
    details: { distanceId: invalid },
  };
}

export async function preflightPatch(params: {
  editionId: string;
  patch: EventAiWizardApplyPatch;
  event: EventAiWizardApplyEvent;
}): Promise<EventAiWizardPreflightFailure | null> {
  const pricingDistanceIds: string[] = Array.from(
    new Set(
      params.patch.ops
        .filter(
          (
            op,
          ): op is Extract<
            EventAiWizardApplyPatch['ops'][number],
            { type: 'create_pricing_tier' }
          > => op.type === 'create_pricing_tier',
        )
        .map((op) => op.distanceId),
    ),
  );

  const tiersByDistanceId = new Map<
    string,
    Array<{
      id: string;
      distanceId: string;
      label: string | null;
      startsAt: Date | null;
      endsAt: Date | null;
      priceCents: number;
      currency: string;
      sortOrder: number;
    }>
  >();

  if (pricingDistanceIds.length) {
    const existingTiers = await db.query.pricingTiers.findMany({
      where: and(
        inArray(pricingTiers.distanceId, pricingDistanceIds),
        isNull(pricingTiers.deletedAt),
      ),
    });

    for (const tier of existingTiers) {
      const existing = tiersByDistanceId.get(tier.distanceId) ?? [];
      existing.push({
        id: tier.id,
        distanceId: tier.distanceId,
        label: tier.label,
        startsAt: tier.startsAt,
        endsAt: tier.endsAt,
        priceCents: tier.priceCents,
        currency: tier.currency,
        sortOrder: tier.sortOrder,
      });
      tiersByDistanceId.set(tier.distanceId, existing);
    }
  }

  for (let opIndex = 0; opIndex < params.patch.ops.length; opIndex += 1) {
    const op = params.patch.ops[opIndex];

    if ('editionId' in op && op.editionId !== params.editionId) {
      return {
        code: 'INVALID_PATCH',
        details: { opIndex, reason: 'EDITION_MISMATCH' },
      };
    }

    if (op.type === 'update_edition') {
      const effectiveTimezone = op.data.timezone ?? params.event.timezone;
      if (
        (op.data.startsAt &&
          !normalizeEditionDateTimeForPersistence(op.data.startsAt, effectiveTimezone)) ||
        (op.data.endsAt &&
          !normalizeEditionDateTimeForPersistence(op.data.endsAt, effectiveTimezone)) ||
        (op.data.registrationOpensAt && !normalizeIsoDateTime(op.data.registrationOpensAt)) ||
        (op.data.registrationClosesAt && !normalizeIsoDateTime(op.data.registrationClosesAt))
      ) {
        return {
          code: 'INVALID_PATCH',
          details: { opIndex, reason: 'INVALID_DATETIME' },
        };
      }

      if (op.data.slug && op.data.slug !== params.event.slug) {
        const existingEdition = await db.query.eventEditions.findFirst({
          where: and(
            eq(eventEditions.seriesId, params.event.seriesId),
            eq(eventEditions.slug, op.data.slug),
            isNull(eventEditions.deletedAt),
          ),
        });
        if (existingEdition) {
          return {
            code: 'INVALID_PATCH',
            details: { opIndex, reason: 'SLUG_TAKEN' },
          };
        }
      }
    }

    if (
      op.type === 'create_distance' &&
      op.data.startTimeLocal !== undefined &&
      normalizeDistanceStartTimeLocal(op.data.startTimeLocal) === null
    ) {
      return {
        code: 'INVALID_PATCH',
        details: { opIndex, reason: 'INVALID_DATETIME' },
      };
    }

    if (op.type === 'create_pricing_tier') {
      const startsAt =
        op.data.startsAt === undefined || op.data.startsAt === null
          ? null
          : normalizeLocalDateTime(op.data.startsAt);
      const endsAt =
        op.data.endsAt === undefined || op.data.endsAt === null
          ? null
          : normalizeLocalDateTime(op.data.endsAt);

      if ((op.data.startsAt && !startsAt) || (op.data.endsAt && !endsAt)) {
        return {
          code: 'INVALID_PATCH',
          details: { opIndex, reason: 'INVALID_DATETIME' },
        };
      }

      const existingTiers = tiersByDistanceId.get(op.distanceId) ?? [];
      const conflictingTier = findConflictingPricingTier(
        {
          startsAt: startsAt ? new Date(startsAt) : null,
          endsAt: endsAt ? new Date(endsAt) : null,
        },
        existingTiers,
      );
      if (conflictingTier) {
        return {
          code: 'INVALID_PATCH',
          details: { opIndex, reason: 'DATE_OVERLAP' },
        };
      }

      tiersByDistanceId.set(op.distanceId, [
        ...existingTiers,
        {
          id: `preflight-${opIndex}`,
          distanceId: op.distanceId,
          label: op.data.label ?? null,
          startsAt: startsAt ? new Date(startsAt) : null,
          endsAt: endsAt ? new Date(endsAt) : null,
          priceCents: resolvePriceCents(op.data),
          currency: op.data.currency ?? 'MXN',
          sortOrder: existingTiers.length,
        },
      ]);
    }
  }

  return null;
}

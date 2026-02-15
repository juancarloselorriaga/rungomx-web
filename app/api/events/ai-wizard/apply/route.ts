import { NextResponse } from 'next/server';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { eventDistances } from '@/db/schema';
import { requireAuthenticatedUser } from '@/lib/auth/guards';
import { updateEventEdition, createDistance, updateDistancePrice } from '@/lib/events/actions';
import { createPricingTier } from '@/lib/events/pricing/actions';
import { getEventEditionDetail } from '@/lib/events/queries';
import { canUserAccessSeries } from '@/lib/organizations/permissions';
import { ProFeatureAccessError, requireProFeature } from '@/lib/pro-features/server/guard';
import { trackProFeatureEvent } from '@/lib/pro-features/server/tracking';
import { eventAiWizardApplyRequestSchema } from '@/lib/events/ai-wizard/schemas';

export const maxDuration = 30;

function proFeatureErrorToResponse(error: ProFeatureAccessError) {
  if (error.decision.status === 'disabled') {
    return NextResponse.json({ code: 'FEATURE_DISABLED' }, { status: 503 });
  }
  return NextResponse.json({ code: 'PRO_REQUIRED' }, { status: 403 });
}

function resolvePriceCents(data: { priceCents?: number; price?: number }): number {
  if (data.priceCents !== undefined) return data.priceCents;
  const price = data.price ?? 0;
  return Math.round(price * 100);
}

function normalizeIsoDateTime(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function normalizeLocalDateTime(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;

  // Fall back to UTC parts rendered as a timezone-less local datetime string.
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}T${pad2(
    date.getUTCHours(),
  )}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = eventAiWizardApplyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', details: parsed.error.issues }, { status: 400 });
  }

  let authContext;
  try {
    authContext = await requireAuthenticatedUser();
  } catch {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  try {
    await requireProFeature('event_ai_wizard', authContext);
  } catch (error) {
    if (error instanceof ProFeatureAccessError) {
      return proFeatureErrorToResponse(error);
    }
    throw error;
  }

  const { editionId, patch } = parsed.data;

  const event = await getEventEditionDetail(editionId);
  if (!event) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const canAccess = await canUserAccessSeries(authContext.user.id, event.seriesId);
  if (!canAccess) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  // Validate referenced distance IDs belong to this edition (server-side boundary).
  const referencedDistanceIds = patch.ops
    .filter((op) => op.type === 'update_distance_price' || op.type === 'create_pricing_tier')
    .map((op) => ('distanceId' in op ? op.distanceId : null))
    .filter((id): id is string => typeof id === 'string');

  if (referencedDistanceIds.length) {
    const rows = await db
      .select({ id: eventDistances.id })
      .from(eventDistances)
      .where(
        and(
          eq(eventDistances.editionId, editionId),
          isNull(eventDistances.deletedAt),
          inArray(eventDistances.id, referencedDistanceIds),
        ),
      );
    const allowed = new Set(rows.map((r) => r.id));
    const invalid = referencedDistanceIds.find((id) => !allowed.has(id));
    if (invalid) {
      return NextResponse.json(
        { error: 'INVALID_DISTANCE', details: { distanceId: invalid } },
        { status: 400 },
      );
    }
  }

  const applied: Array<{ opIndex: number; type: string; result?: unknown }> = [];

  function opError(status: number, payload: Record<string, unknown>) {
    return NextResponse.json({ ...payload, applied }, { status });
  }

  for (let i = 0; i < patch.ops.length; i += 1) {
    const op = patch.ops[i];

    if (op.type === 'update_edition') {
      if (op.editionId !== editionId) {
        return opError(400, { error: 'INVALID_OP', details: { opIndex: i } });
      }

      const data = op.data;
      const startsAt =
        data.startsAt === undefined
          ? undefined
          : data.startsAt === null
            ? null
            : normalizeIsoDateTime(data.startsAt);
      const endsAt =
        data.endsAt === undefined
          ? undefined
          : data.endsAt === null
            ? null
            : normalizeIsoDateTime(data.endsAt);
      const registrationOpensAt =
        data.registrationOpensAt === undefined
          ? undefined
          : data.registrationOpensAt === null
            ? null
            : normalizeIsoDateTime(data.registrationOpensAt);
      const registrationClosesAt =
        data.registrationClosesAt === undefined
          ? undefined
          : data.registrationClosesAt === null
            ? null
            : normalizeIsoDateTime(data.registrationClosesAt);

      if (
        (data.startsAt && !startsAt) ||
        (data.endsAt && !endsAt) ||
        (data.registrationOpensAt && !registrationOpensAt) ||
        (data.registrationClosesAt && !registrationClosesAt)
      ) {
        return opError(400, { error: 'INVALID_DATETIME', details: { opIndex: i } });
      }

      const result = await updateEventEdition({
        editionId,
        editionLabel: data.editionLabel,
        slug: data.slug,
        description: data.description,
        timezone: data.timezone,
        startsAt,
        endsAt,
        city: data.city,
        state: data.state,
        locationDisplay: data.locationDisplay,
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
        externalUrl: data.externalUrl,
        registrationOpensAt,
        registrationClosesAt,
      });

      if (!result.ok) {
        return opError(400, {
          error: 'OP_FAILED',
          details: { opIndex: i, code: result.code, message: result.error },
        });
      }

      applied.push({ opIndex: i, type: op.type });
      continue;
    }

    if (op.type === 'create_distance') {
      if (op.editionId !== editionId) {
        return opError(400, { error: 'INVALID_OP', details: { opIndex: i } });
      }

      const priceCents = resolvePriceCents(op.data);
      const startTimeLocal =
        op.data.startTimeLocal === undefined
          ? undefined
          : op.data.startTimeLocal === null
            ? null
            : normalizeIsoDateTime(op.data.startTimeLocal);
      if (op.data.startTimeLocal && !startTimeLocal) {
        return opError(400, { error: 'INVALID_DATETIME', details: { opIndex: i } });
      }

      const result = await createDistance({
        editionId,
        label: op.data.label,
        distanceValue: op.data.distanceValue,
        distanceUnit: op.data.distanceUnit ?? 'km',
        kind: op.data.kind ?? 'distance',
        startTimeLocal: startTimeLocal ?? undefined,
        timeLimitMinutes: op.data.timeLimitMinutes ?? undefined,
        terrain: op.data.terrain ?? undefined,
        isVirtual: op.data.isVirtual ?? false,
        capacity: op.data.capacity ?? undefined,
        capacityScope: op.data.capacityScope ?? 'per_distance',
        priceCents,
      });

      if (!result.ok) {
        return opError(400, {
          error: 'OP_FAILED',
          details: { opIndex: i, code: result.code, message: result.error },
        });
      }

      applied.push({ opIndex: i, type: op.type, result: result.data });
      continue;
    }

    if (op.type === 'update_distance_price') {
      const priceCents = resolvePriceCents(op.data);
      const result = await updateDistancePrice({ distanceId: op.distanceId, priceCents });

      if (!result.ok) {
        return opError(400, {
          error: 'OP_FAILED',
          details: { opIndex: i, code: result.code, message: result.error },
        });
      }

      applied.push({ opIndex: i, type: op.type });
      continue;
    }

    if (op.type === 'create_pricing_tier') {
      const priceCents = resolvePriceCents(op.data);
      const startsAt =
        op.data.startsAt === undefined || op.data.startsAt === null
          ? null
          : normalizeLocalDateTime(op.data.startsAt);
      const endsAt =
        op.data.endsAt === undefined || op.data.endsAt === null
          ? null
          : normalizeLocalDateTime(op.data.endsAt);

      if ((op.data.startsAt && !startsAt) || (op.data.endsAt && !endsAt)) {
        return opError(400, { error: 'INVALID_DATETIME', details: { opIndex: i } });
      }

      const result = await createPricingTier({
        distanceId: op.distanceId,
        label: op.data.label ?? null,
        startsAt,
        endsAt,
        priceCents,
        currency: op.data.currency ?? 'MXN',
      });

      if (!result.ok) {
        return opError(400, {
          error: 'OP_FAILED',
          details: { opIndex: i, code: result.code, message: result.error },
        });
      }

      applied.push({ opIndex: i, type: op.type, result: result.data });
      continue;
    }

    return opError(400, { error: 'UNKNOWN_OP', details: { opIndex: i } });
  }

  await trackProFeatureEvent({
    featureKey: 'event_ai_wizard',
    userId: authContext.user.id,
    eventType: 'used',
    meta: { editionId, opCount: patch.ops.length },
  });

  return NextResponse.json({ ok: true, applied });
}

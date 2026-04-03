import { createHash } from 'node:crypto';

import { and, eq, isNull } from 'drizzle-orm';

import {
  eventDistances,
  eventEditions,
  eventFaqItems,
  eventPolicyConfigs,
  eventSlugRedirects,
  eventWebsiteContent,
  pricingTiers,
  registrationQuestions,
  waivers,
} from '@/db/schema';
import { createAuditLog } from '@/lib/audit';
import { findConflictingPricingTier } from '@/lib/events/pricing/contracts';
import {
  DEFAULT_WEBSITE_BLOCKS,
  websiteContentBlocksSchema,
  type WebsiteContentBlocks,
} from '@/lib/events/website/types';

import type { ApplyTx } from './db-client';

type ApplyActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

type ApplyMutationContext = {
  tx: ApplyTx;
  editionId: string;
  actorUserId: string;
  organizationId: string;
  requestContext: {
    ipAddress?: string;
    userAgent?: string;
  };
};

type EventEditionMutationRecord = typeof eventEditions.$inferSelect & {
  series: { id: string; slug: string; organizationId: string };
};

function isUniqueConstraintError(error: unknown, constraintName?: string) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: string; constraint?: string };
  if (candidate.code !== '23505') {
    return false;
  }

  return !constraintName || candidate.constraint === constraintName;
}

function toWebsiteBlocks(value: unknown): WebsiteContentBlocks {
  const parsed = websiteContentBlocksSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_WEBSITE_BLOCKS;
}

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toOptionalDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function buildAuditFailure(error: string): never {
  throw new Error(error);
}

async function requireCurrentEdition(
  tx: ApplyTx,
  editionId: string,
): Promise<EventEditionMutationRecord | null> {
  return tx.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    with: {
      series: {
        columns: {
          id: true,
          slug: true,
          organizationId: true,
        },
      },
    },
  }) as Promise<EventEditionMutationRecord | null>;
}

export async function updateEventEdition(
  context: ApplyMutationContext,
  input: {
    editionLabel?: string;
    slug?: string;
    description?: string | null;
    timezone?: string;
    startsAt?: string | null;
    endsAt?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    locationDisplay?: string | null;
    address?: string | null;
    latitude?: string | null;
    longitude?: string | null;
    externalUrl?: string | null;
    registrationOpensAt?: string | null;
    registrationClosesAt?: string | null;
  },
): Promise<ApplyActionResult<{ id: string }>> {
  const currentEdition = await requireCurrentEdition(context.tx, context.editionId);
  if (!currentEdition?.series) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  if (input.slug && input.slug !== currentEdition.slug) {
    const existingEdition = await context.tx.query.eventEditions.findFirst({
      where: and(
        eq(eventEditions.seriesId, currentEdition.seriesId),
        eq(eventEditions.slug, input.slug),
        isNull(eventEditions.deletedAt),
      ),
      columns: { id: true },
    });

    if (existingEdition) {
      return {
        ok: false,
        error: 'Edition slug is already taken in this series',
        code: 'SLUG_TAKEN',
      };
    }
  }

  const updateData: Record<string, unknown> = {};
  if (input.editionLabel !== undefined) updateData.editionLabel = input.editionLabel;
  if (input.slug !== undefined) updateData.slug = input.slug;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.timezone !== undefined) updateData.timezone = input.timezone;
  if (input.startsAt !== undefined) updateData.startsAt = toOptionalDate(input.startsAt);
  if (input.endsAt !== undefined) updateData.endsAt = toOptionalDate(input.endsAt);
  if (input.city !== undefined) updateData.city = input.city;
  if (input.state !== undefined) updateData.state = input.state;
  if (input.country !== undefined) updateData.country = input.country;
  if (input.locationDisplay !== undefined) updateData.locationDisplay = input.locationDisplay;
  if (input.address !== undefined) updateData.address = input.address;
  if (input.latitude !== undefined) updateData.latitude = input.latitude;
  if (input.longitude !== undefined) updateData.longitude = input.longitude;
  if (input.externalUrl !== undefined) updateData.externalUrl = input.externalUrl;
  if (input.registrationOpensAt !== undefined) {
    updateData.registrationOpensAt = toOptionalDate(input.registrationOpensAt);
  }
  if (input.registrationClosesAt !== undefined) {
    updateData.registrationClosesAt = toOptionalDate(input.registrationClosesAt);
  }

  if (Object.keys(updateData).length === 0) {
    return { ok: true, data: { id: currentEdition.id } };
  }

  try {
    const [updatedEdition] = await context.tx
      .update(eventEditions)
      .set(updateData)
      .where(eq(eventEditions.id, context.editionId))
      .returning();

    if (input.slug && input.slug !== currentEdition.slug) {
      await context.tx
        .insert(eventSlugRedirects)
        .values({
          fromSeriesSlug: currentEdition.series.slug,
          fromEditionSlug: currentEdition.slug,
          toSeriesSlug: currentEdition.series.slug,
          toEditionSlug: input.slug,
          reason: 'edition_slug_change',
        })
        .onConflictDoNothing({
          target: [eventSlugRedirects.fromSeriesSlug, eventSlugRedirects.fromEditionSlug],
        });
    }

    const auditBefore: Record<string, unknown> = {};
    const auditAfter: Record<string, unknown> = {};
    for (const key of Object.keys(updateData)) {
      auditBefore[key] = (currentEdition as Record<string, unknown>)[key];
      auditAfter[key] = (updatedEdition as Record<string, unknown>)[key];
    }

    const auditResult = await createAuditLog(
      {
        organizationId: context.organizationId,
        actorUserId: context.actorUserId,
        action: 'event.update',
        entityType: 'event_edition',
        entityId: context.editionId,
        before: auditBefore,
        after: auditAfter,
        request: context.requestContext,
      },
      context.tx,
    );

    if (!auditResult.ok) {
      buildAuditFailure(`AI_WIZARD_APPLY_EVENT_UPDATE_AUDIT_FAILED:${auditResult.error}`);
    }

    return { ok: true, data: { id: updatedEdition.id } };
  } catch (error) {
    if (isUniqueConstraintError(error, 'event_editions_series_slug_idx')) {
      return {
        ok: false,
        error: 'Edition slug is already taken in this series',
        code: 'SLUG_TAKEN',
      };
    }

    throw error;
  }
}

export async function createDistance(
  context: ApplyMutationContext,
  input: {
    label: string;
    distanceValue?: number;
    distanceUnit?: string;
    kind?: string;
    startTimeLocal?: string;
    timeLimitMinutes?: number;
    terrain?: string;
    isVirtual?: boolean;
    capacity?: number;
    capacityScope?: string;
    priceCents: number;
  },
): Promise<ApplyActionResult<{ id: string }>> {
  const existingDistances = await context.tx.query.eventDistances.findMany({
    where: and(eq(eventDistances.editionId, context.editionId), isNull(eventDistances.deletedAt)),
    orderBy: (distance, { desc }) => [desc(distance.sortOrder)],
    limit: 1,
  });
  const lastDistance = existingDistances[0];

  const edition = await context.tx.query.eventEditions.findFirst({
    where: eq(eventEditions.id, context.editionId),
    columns: { sharedCapacity: true },
  });

  const [newDistance] = await context.tx
    .insert(eventDistances)
    .values({
      editionId: context.editionId,
      label: input.label,
      distanceValue: input.distanceValue?.toString(),
      distanceUnit: input.distanceUnit ?? 'km',
      kind: input.kind ?? 'distance',
      startTimeLocal: input.startTimeLocal ? new Date(input.startTimeLocal) : undefined,
      timeLimitMinutes: input.timeLimitMinutes,
      terrain: input.terrain,
      isVirtual: input.isVirtual ?? false,
      capacity: input.capacity,
      capacityScope: edition?.sharedCapacity
        ? 'shared_pool'
        : (input.capacityScope ?? 'per_distance'),
      sortOrder: (lastDistance?.sortOrder ?? -1) + 1,
    })
    .returning();

  await context.tx.insert(pricingTiers).values({
    distanceId: newDistance.id,
    label: null,
    priceCents: input.priceCents,
    currency: 'MXN',
    sortOrder: 0,
  });

  const auditResult = await createAuditLog(
    {
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      action: 'distance.create',
      entityType: 'event_distance',
      entityId: newDistance.id,
      after: { label: input.label, priceCents: input.priceCents },
      request: context.requestContext,
    },
    context.tx,
  );

  if (!auditResult.ok) {
    buildAuditFailure(`AI_WIZARD_APPLY_DISTANCE_CREATE_AUDIT_FAILED:${auditResult.error}`);
  }

  return { ok: true, data: { id: newDistance.id } };
}

export async function updateDistancePrice(
  context: ApplyMutationContext,
  input: {
    distanceId: string;
    priceCents: number;
  },
): Promise<ApplyActionResult> {
  const distance = await context.tx.query.eventDistances.findFirst({
    where: and(
      eq(eventDistances.id, input.distanceId),
      eq(eventDistances.editionId, context.editionId),
      isNull(eventDistances.deletedAt),
    ),
    with: {
      pricingTiers: {
        where: isNull(pricingTiers.deletedAt),
        orderBy: (tier, { asc }) => [asc(tier.sortOrder)],
      },
    },
  });

  if (!distance) {
    return { ok: false, error: 'Distance not found for this edition', code: 'INVALID_DISTANCE' };
  }

  const currentTier = distance.pricingTiers[0];
  if (currentTier) {
    await context.tx
      .update(pricingTiers)
      .set({ priceCents: input.priceCents })
      .where(eq(pricingTiers.id, currentTier.id));
  } else {
    await context.tx.insert(pricingTiers).values({
      distanceId: input.distanceId,
      label: null,
      priceCents: input.priceCents,
      currency: 'MXN',
      sortOrder: 0,
    });
  }

  const auditResult = await createAuditLog(
    {
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      action: 'distance.update_price',
      entityType: 'event_distance',
      entityId: input.distanceId,
      before: { priceCents: currentTier?.priceCents },
      after: { priceCents: input.priceCents },
      request: context.requestContext,
    },
    context.tx,
  );

  if (!auditResult.ok) {
    buildAuditFailure(`AI_WIZARD_APPLY_DISTANCE_PRICE_AUDIT_FAILED:${auditResult.error}`);
  }

  return { ok: true, data: undefined };
}

export async function createPricingTier(
  context: ApplyMutationContext,
  input: {
    distanceId: string;
    label?: string | null;
    startsAt: string | null;
    endsAt: string | null;
    priceCents: number;
    currency?: string;
  },
): Promise<ApplyActionResult<{ id: string }>> {
  const distance = await context.tx.query.eventDistances.findFirst({
    where: and(
      eq(eventDistances.id, input.distanceId),
      eq(eventDistances.editionId, context.editionId),
      isNull(eventDistances.deletedAt),
    ),
    columns: { id: true },
  });

  if (!distance) {
    return { ok: false, error: 'Distance not found for this edition', code: 'INVALID_DISTANCE' };
  }

  const existingTiers = await context.tx.query.pricingTiers.findMany({
    where: and(eq(pricingTiers.distanceId, input.distanceId), isNull(pricingTiers.deletedAt)),
  });

  const startsAtDate = toOptionalDate(input.startsAt);
  const endsAtDate = toOptionalDate(input.endsAt);
  const conflictingTier = findConflictingPricingTier(
    {
      startsAt: startsAtDate,
      endsAt: endsAtDate,
    },
    existingTiers,
  );

  if (conflictingTier) {
    return {
      ok: false,
      error: 'Date range overlaps with an existing pricing tier',
      code: 'DATE_OVERLAP',
    };
  }

  const maxSortOrder = existingTiers.reduce((max, tier) => Math.max(max, tier.sortOrder), -1);
  const [newTier] = await context.tx
    .insert(pricingTiers)
    .values({
      distanceId: input.distanceId,
      label: input.label ?? null,
      startsAt: startsAtDate,
      endsAt: endsAtDate,
      priceCents: input.priceCents,
      currency: input.currency ?? 'MXN',
      sortOrder: maxSortOrder + 1,
    })
    .returning();

  const auditResult = await createAuditLog(
    {
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      action: 'pricing.create',
      entityType: 'pricing_tier',
      entityId: newTier.id,
      after: {
        label: input.label ?? null,
        priceCents: input.priceCents,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      },
      request: context.requestContext,
    },
    context.tx,
  );

  if (!auditResult.ok) {
    buildAuditFailure(`AI_WIZARD_APPLY_PRICING_CREATE_AUDIT_FAILED:${auditResult.error}`);
  }

  return { ok: true, data: { id: newTier.id } };
}

export async function createFaqItem(
  context: ApplyMutationContext,
  input: {
    question: string;
    answer: string;
  },
): Promise<ApplyActionResult<{ id: string }>> {
  const existingFaqItems = await context.tx.query.eventFaqItems.findMany({
    where: and(eq(eventFaqItems.editionId, context.editionId), isNull(eventFaqItems.deletedAt)),
    orderBy: (faqItem, { desc }) => [desc(faqItem.sortOrder)],
    limit: 1,
  });
  const lastFaqItem = existingFaqItems[0];

  const [newFaqItem] = await context.tx
    .insert(eventFaqItems)
    .values({
      editionId: context.editionId,
      question: input.question,
      answer: input.answer,
      sortOrder: (lastFaqItem?.sortOrder ?? -1) + 1,
    })
    .returning();

  const auditResult = await createAuditLog(
    {
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      action: 'faq.create',
      entityType: 'event_faq_item',
      entityId: newFaqItem.id,
      after: { question: input.question },
      request: context.requestContext,
    },
    context.tx,
  );

  if (!auditResult.ok) {
    buildAuditFailure(`AI_WIZARD_APPLY_FAQ_CREATE_AUDIT_FAILED:${auditResult.error}`);
  }

  return { ok: true, data: { id: newFaqItem.id } };
}

export async function createWaiver(
  context: ApplyMutationContext,
  input: {
    title: string;
    body: string;
    signatureType?: string;
  },
): Promise<ApplyActionResult<{ id: string }>> {
  const existingWaivers = await context.tx.query.waivers.findMany({
    where: and(eq(waivers.editionId, context.editionId), isNull(waivers.deletedAt)),
    orderBy: (waiver, { desc }) => [desc(waiver.displayOrder)],
    limit: 1,
  });
  const lastWaiver = existingWaivers[0];

  const [newWaiver] = await context.tx
    .insert(waivers)
    .values({
      editionId: context.editionId,
      title: input.title,
      body: input.body,
      versionHash: createHash('sha256').update(input.body).digest('hex'),
      signatureType: input.signatureType ?? 'checkbox',
      displayOrder: (lastWaiver?.displayOrder ?? -1) + 1,
    })
    .returning();

  const auditResult = await createAuditLog(
    {
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      action: 'waiver.create',
      entityType: 'waiver',
      entityId: newWaiver.id,
      after: { title: input.title },
      request: context.requestContext,
    },
    context.tx,
  );

  if (!auditResult.ok) {
    buildAuditFailure(`AI_WIZARD_APPLY_WAIVER_CREATE_AUDIT_FAILED:${auditResult.error}`);
  }

  return { ok: true, data: { id: newWaiver.id } };
}

export async function createQuestion(
  context: ApplyMutationContext,
  input: {
    distanceId: string | null;
    type: 'text' | 'single_select' | 'checkbox';
    prompt: string;
    helpText: string | null;
    isRequired: boolean;
    options: string[] | null;
    sortOrder: number;
    isActive: boolean;
  },
): Promise<ApplyActionResult<{ id: string }>> {
  if (input.distanceId) {
    const matchingDistance = await context.tx.query.eventDistances.findFirst({
      where: and(
        eq(eventDistances.id, input.distanceId),
        eq(eventDistances.editionId, context.editionId),
        isNull(eventDistances.deletedAt),
      ),
      columns: { id: true },
    });

    if (!matchingDistance) {
      return {
        ok: false,
        error: 'Distance not found for this edition',
        code: 'INVALID_DISTANCE',
      };
    }
  }

  const [newQuestion] = await context.tx
    .insert(registrationQuestions)
    .values({
      editionId: context.editionId,
      distanceId: input.distanceId,
      type: input.type,
      prompt: input.prompt,
      helpText: input.helpText,
      isRequired: input.isRequired,
      options: input.options,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    })
    .returning();

  const auditResult = await createAuditLog(
    {
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      action: 'registration_question.create',
      entityType: 'registration_question',
      entityId: newQuestion.id,
      after: {
        prompt: input.prompt,
        type: input.type,
        isRequired: input.isRequired,
      },
      request: context.requestContext,
    },
    context.tx,
  );

  if (!auditResult.ok) {
    buildAuditFailure(`AI_WIZARD_APPLY_QUESTION_CREATE_AUDIT_FAILED:${auditResult.error}`);
  }

  return { ok: true, data: { id: newQuestion.id } };
}

export async function getWebsiteContent(
  context: ApplyMutationContext,
  input: {
    locale: string;
  },
): Promise<
  ApplyActionResult<{
    id: string | null;
    editionId: string;
    locale: string;
    blocks: WebsiteContentBlocks;
    mediaUrls: Record<string, string>;
    createdAt: Date | null;
    updatedAt: Date | null;
  }>
> {
  const existingContent = await context.tx.query.eventWebsiteContent.findFirst({
    where: and(
      eq(eventWebsiteContent.editionId, context.editionId),
      eq(eventWebsiteContent.locale, input.locale),
      isNull(eventWebsiteContent.deletedAt),
    ),
  });

  if (!existingContent) {
    return {
      ok: true,
      data: {
        id: null,
        editionId: context.editionId,
        locale: input.locale,
        blocks: DEFAULT_WEBSITE_BLOCKS,
        mediaUrls: {},
        createdAt: null,
        updatedAt: null,
      },
    };
  }

  return {
    ok: true,
    data: {
      id: existingContent.id,
      editionId: existingContent.editionId,
      locale: existingContent.locale,
      blocks: toWebsiteBlocks(existingContent.blocksJson),
      mediaUrls: {},
      createdAt: existingContent.createdAt,
      updatedAt: existingContent.updatedAt,
    },
  };
}

export async function updateWebsiteContent(
  context: ApplyMutationContext,
  input: {
    locale: string;
    blocks: WebsiteContentBlocks;
  },
): Promise<ApplyActionResult<{ id: string }>> {
  const existingContent = await context.tx.query.eventWebsiteContent.findFirst({
    where: and(
      eq(eventWebsiteContent.editionId, context.editionId),
      eq(eventWebsiteContent.locale, input.locale),
      isNull(eventWebsiteContent.deletedAt),
    ),
  });

  if (existingContent) {
    const [updatedContent] = await context.tx
      .update(eventWebsiteContent)
      .set({
        blocksJson: input.blocks as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(eventWebsiteContent.id, existingContent.id))
      .returning({ id: eventWebsiteContent.id });

    const auditResult = await createAuditLog(
      {
        organizationId: context.organizationId,
        actorUserId: context.actorUserId,
        action: 'website.update',
        entityType: 'event_website_content',
        entityId: updatedContent.id,
        before: existingContent.blocksJson as Record<string, unknown>,
        after: input.blocks as Record<string, unknown>,
        request: context.requestContext,
      },
      context.tx,
    );

    if (!auditResult.ok) {
      buildAuditFailure(`AI_WIZARD_APPLY_WEBSITE_UPDATE_AUDIT_FAILED:${auditResult.error}`);
    }

    return { ok: true, data: { id: updatedContent.id } };
  }

  const [createdContent] = await context.tx
    .insert(eventWebsiteContent)
    .values({
      editionId: context.editionId,
      locale: input.locale,
      blocksJson: input.blocks as Record<string, unknown>,
    })
    .returning({ id: eventWebsiteContent.id });

  const auditResult = await createAuditLog(
    {
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      action: 'website.update',
      entityType: 'event_website_content',
      entityId: createdContent.id,
      after: input.blocks as Record<string, unknown>,
      request: context.requestContext,
    },
    context.tx,
  );

  if (!auditResult.ok) {
    buildAuditFailure(`AI_WIZARD_APPLY_WEBSITE_CREATE_AUDIT_FAILED:${auditResult.error}`);
  }

  return { ok: true, data: { id: createdContent.id } };
}

export async function updateEventPolicyConfig(
  context: ApplyMutationContext,
  input: {
    refundsAllowed: boolean;
    refundPolicyText: string | null;
    refundDeadline: string | null;
    transfersAllowed: boolean;
    transferPolicyText: string | null;
    transferDeadline: string | null;
    deferralsAllowed: boolean;
    deferralPolicyText: string | null;
    deferralDeadline: string | null;
  },
): Promise<
  ApplyActionResult<{
    refundsAllowed: boolean;
    refundPolicyText: string | null;
    refundDeadline: string | null;
    transfersAllowed: boolean;
    transferPolicyText: string | null;
    transferDeadline: string | null;
    deferralsAllowed: boolean;
    deferralPolicyText: string | null;
    deferralDeadline: string | null;
  }>
> {
  const existingPolicyConfig = await context.tx.query.eventPolicyConfigs.findFirst({
    where: eq(eventPolicyConfigs.editionId, context.editionId),
  });

  const payload = {
    refundsAllowed: input.refundsAllowed,
    refundPolicyText: input.refundPolicyText?.trim() || null,
    refundDeadline: toOptionalDate(input.refundDeadline),
    transfersAllowed: input.transfersAllowed,
    transferPolicyText: input.transferPolicyText?.trim() || null,
    transferDeadline: toOptionalDate(input.transferDeadline),
    deferralsAllowed: input.deferralsAllowed,
    deferralPolicyText: input.deferralPolicyText?.trim() || null,
    deferralDeadline: toOptionalDate(input.deferralDeadline),
  };

  const [policyRecord] = existingPolicyConfig
    ? await context.tx
        .update(eventPolicyConfigs)
        .set(payload)
        .where(eq(eventPolicyConfigs.editionId, context.editionId))
        .returning()
    : await context.tx
        .insert(eventPolicyConfigs)
        .values({ editionId: context.editionId, ...payload })
        .returning();

  const auditResult = await createAuditLog(
    {
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      action: 'policy.update',
      entityType: 'event_policy_config',
      entityId: policyRecord.id,
      before: existingPolicyConfig ?? undefined,
      after: policyRecord,
      request: context.requestContext,
    },
    context.tx,
  );

  if (!auditResult.ok) {
    buildAuditFailure(`AI_WIZARD_APPLY_POLICY_UPDATE_AUDIT_FAILED:${auditResult.error}`);
  }

  return {
    ok: true,
    data: {
      refundsAllowed: policyRecord.refundsAllowed,
      refundPolicyText: policyRecord.refundPolicyText,
      refundDeadline: toIsoString(policyRecord.refundDeadline),
      transfersAllowed: policyRecord.transfersAllowed,
      transferPolicyText: policyRecord.transferPolicyText,
      transferDeadline: toIsoString(policyRecord.transferDeadline),
      deferralsAllowed: policyRecord.deferralsAllowed,
      deferralPolicyText: policyRecord.deferralPolicyText,
      deferralDeadline: toIsoString(policyRecord.deferralDeadline),
    },
  };
}

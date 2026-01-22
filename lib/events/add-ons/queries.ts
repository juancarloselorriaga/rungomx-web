import { and, asc, eq, isNull } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';

import { db } from '@/db';
import { addOnOptions, addOns, addOnSelections } from '@/db/schema';
import { eventEditionAddOnsTag } from '../cache-tags';
import type { AddOnData } from './actions';

/**
 * Get all add-ons for an event edition with their options.
 */
export async function getAddOnsForEdition(editionId: string): Promise<AddOnData[]> {
  'use cache: remote';
  cacheTag(eventEditionAddOnsTag(editionId));
  cacheLife({ expire: 300 });

  const result = await db.query.addOns.findMany({
    where: and(eq(addOns.editionId, editionId), isNull(addOns.deletedAt)),
    orderBy: [asc(addOns.sortOrder)],
    with: {
      options: {
        where: isNull(addOnOptions.deletedAt),
        orderBy: [asc(addOnOptions.sortOrder)],
      },
    },
  });

  return result.map((addOn) => ({
    id: addOn.id,
    editionId: addOn.editionId,
    distanceId: addOn.distanceId,
    title: addOn.title,
    description: addOn.description,
    type: addOn.type,
    deliveryMethod: addOn.deliveryMethod,
    isActive: addOn.isActive,
    sortOrder: addOn.sortOrder,
    options: addOn.options.map((opt) => ({
      id: opt.id,
      addOnId: opt.addOnId,
      label: opt.label,
      priceCents: opt.priceCents,
      maxQtyPerOrder: opt.maxQtyPerOrder,
      optionMeta: opt.optionMeta,
      isActive: opt.isActive,
      sortOrder: opt.sortOrder,
    })),
  }));
}

/**
 * Get add-ons available for a specific distance (includes edition-wide add-ons).
 */
export async function getAddOnsForDistance(
  editionId: string,
  distanceId: string,
): Promise<AddOnData[]> {
  'use cache: remote';
  cacheTag(eventEditionAddOnsTag(editionId));
  cacheLife({ expire: 300 });

  const result = await db.query.addOns.findMany({
    where: and(
      eq(addOns.editionId, editionId),
      isNull(addOns.deletedAt),
      eq(addOns.isActive, true),
    ),
    orderBy: [asc(addOns.sortOrder)],
    with: {
      options: {
        where: and(isNull(addOnOptions.deletedAt), eq(addOnOptions.isActive, true)),
        orderBy: [asc(addOnOptions.sortOrder)],
      },
    },
  });

  // Filter to include edition-wide add-ons (distanceId is null) or distance-specific ones
  return result
    .filter((addOn) => addOn.distanceId === null || addOn.distanceId === distanceId)
    .map((addOn) => ({
      id: addOn.id,
      editionId: addOn.editionId,
      distanceId: addOn.distanceId,
      title: addOn.title,
      description: addOn.description,
      type: addOn.type,
      deliveryMethod: addOn.deliveryMethod,
      isActive: addOn.isActive,
      sortOrder: addOn.sortOrder,
      options: addOn.options.map((opt) => ({
        id: opt.id,
        addOnId: opt.addOnId,
        label: opt.label,
        priceCents: opt.priceCents,
        maxQtyPerOrder: opt.maxQtyPerOrder,
        optionMeta: opt.optionMeta,
        isActive: opt.isActive,
        sortOrder: opt.sortOrder,
      })),
    }));
}

/**
 * Get a single add-on by ID with its options.
 */
export async function getAddOnById(addOnId: string): Promise<AddOnData | null> {
  const addOn = await db.query.addOns.findFirst({
    where: and(eq(addOns.id, addOnId), isNull(addOns.deletedAt)),
    with: {
      options: {
        where: isNull(addOnOptions.deletedAt),
        orderBy: [asc(addOnOptions.sortOrder)],
      },
    },
  });

  if (!addOn) return null;

  return {
    id: addOn.id,
    editionId: addOn.editionId,
    distanceId: addOn.distanceId,
    title: addOn.title,
    description: addOn.description,
    type: addOn.type,
    deliveryMethod: addOn.deliveryMethod,
    isActive: addOn.isActive,
    sortOrder: addOn.sortOrder,
    options: addOn.options.map((opt) => ({
      id: opt.id,
      addOnId: opt.addOnId,
      label: opt.label,
      priceCents: opt.priceCents,
      maxQtyPerOrder: opt.maxQtyPerOrder,
      optionMeta: opt.optionMeta,
      isActive: opt.isActive,
      sortOrder: opt.sortOrder,
    })),
  };
}

/**
 * Get add-on selections for a registration.
 */
export async function getAddOnSelectionsForRegistration(registrationId: string) {
  const selections = await db.query.addOnSelections.findMany({
    where: and(
      eq(addOnSelections.registrationId, registrationId),
      isNull(addOnSelections.deletedAt),
    ),
    with: {
      option: {
        with: {
          addOn: true,
        },
      },
    },
  });

  return selections.map((selection) => ({
    id: selection.id,
    registrationId: selection.registrationId,
    optionId: selection.optionId,
    quantity: selection.quantity,
    lineTotalCents: selection.lineTotalCents,
    option: {
      id: selection.option.id,
      label: selection.option.label,
      priceCents: selection.option.priceCents,
      optionMeta: selection.option.optionMeta,
      addOn: {
        id: selection.option.addOn.id,
        title: selection.option.addOn.title,
        type: selection.option.addOn.type,
        deliveryMethod: selection.option.addOn.deliveryMethod,
      },
    },
  }));
}

/**
 * Calculate the total add-on cost for a registration.
 */
export async function calculateAddOnTotal(registrationId: string): Promise<number> {
  const selections = await db.query.addOnSelections.findMany({
    where: and(
      eq(addOnSelections.registrationId, registrationId),
      isNull(addOnSelections.deletedAt),
    ),
  });

  return selections.reduce((total, selection) => total + selection.lineTotalCents, 0);
}

'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import { eventEditions } from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import type { AuthContext } from '@/lib/auth/server';
import { isEventsEnabled } from '@/lib/features/flags';
import {
  canUserAccessEvent,
  requireOrgPermission,
} from '@/lib/organizations/permissions';
import { REGISTRATION_STATUS } from '../constants';
import { getAddOnSalesSummary, getRegistrationsForExport, type RegistrationExportData } from './queries';

// =============================================================================
// Types
// =============================================================================

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

// =============================================================================
// Helpers
// =============================================================================

function checkEventsAccess(authContext: AuthContext): { error: string; code: string } | null {
  if (authContext.permissions.canManageEvents) {
    return null;
  }

  if (!isEventsEnabled()) {
    return {
      error: 'Events platform is not enabled',
      code: 'FEATURE_DISABLED',
    };
  }

  if (!authContext.permissions.canViewOrganizersDashboard) {
    return {
      error: 'You do not have permission to manage events',
      code: 'FORBIDDEN',
    };
  }

  return null;
}

/**
 * Convert registrations to CSV format.
 */
function convertToCSV(data: RegistrationExportData[]): string {
  if (data.length === 0) return '';

  // Get all unique custom question prompts
  const allCustomQuestions = new Set<string>();
  for (const row of data) {
    for (const key of Object.keys(row.customAnswers)) {
      allCustomQuestions.add(key);
    }
  }
  const customQuestionColumns = Array.from(allCustomQuestions);

  // Build header row
  const headers = [
    'Registration ID',
    'Status',
    'Created At',
    'Distance',
    'Base Price (cents)',
    'Fees (cents)',
    'Discount (cents)',
    'Discount Code',
    'Total (cents)',
    'Buyer Name',
    'Buyer Email',
    'First Name',
    'Last Name',
    'Email',
    'Phone',
    'Date of Birth',
    'Gender',
    'City',
    'State',
    'Country',
    'Emergency Contact Name',
    'Emergency Contact Phone',
    'Waivers Accepted',
    'Waiver Accepted At',
    ...customQuestionColumns,
    'Add-Ons',
  ];

  // Escape CSV field
  const escapeCSV = (value: string | null | undefined): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Build rows
  const rows = data.map((row) => {
    const addOnsStr = row.addOnSelections
      .map((s) => `${s.addOnTitle}: ${s.optionLabel} (x${s.quantity})`)
      .join('; ');

    return [
      escapeCSV(row.id),
      escapeCSV(row.status),
      escapeCSV(row.createdAt),
      escapeCSV(row.distanceLabel),
      row.basePriceCents?.toString() ?? '',
      row.feesCents?.toString() ?? '',
      row.discountAmountCents?.toString() ?? '',
      escapeCSV(row.discountCode),
      row.totalCents?.toString() ?? '',
      escapeCSV(row.buyerName),
      escapeCSV(row.buyerEmail),
      escapeCSV(row.registrantFirstName),
      escapeCSV(row.registrantLastName),
      escapeCSV(row.registrantEmail),
      escapeCSV(row.registrantPhone),
      escapeCSV(row.registrantDateOfBirth),
      escapeCSV(row.registrantGender),
      escapeCSV(row.registrantCity),
      escapeCSV(row.registrantState),
      escapeCSV(row.registrantCountry),
      escapeCSV(row.registrantEmergencyContactName),
      escapeCSV(row.registrantEmergencyContactPhone),
      row.waiversAccepted ? 'Yes' : 'No',
      escapeCSV(row.waiverAcceptedAt),
      ...customQuestionColumns.map((q) => escapeCSV(row.customAnswers[q])),
      escapeCSV(addOnsStr),
    ].join(',');
  });

  return [headers.map(escapeCSV).join(','), ...rows].join('\n');
}

/**
 * Convert add-on sales to CSV format.
 */
function convertAddOnSalesToCSV(
  data: Array<{
    addOnTitle: string;
    optionLabel: string;
    totalQuantity: number;
    totalRevenueCents: number;
  }>,
): string {
  if (data.length === 0) return '';

  const escapeCSV = (value: string | null | undefined): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = ['Add-On', 'Option', 'Total Quantity', 'Total Revenue (cents)'];
  const rows = data.map((row) =>
    [
      escapeCSV(row.addOnTitle),
      escapeCSV(row.optionLabel),
      row.totalQuantity.toString(),
      row.totalRevenueCents.toString(),
    ].join(','),
  );

  return [headers.join(','), ...rows].join('\n');
}

// =============================================================================
// Schemas
// =============================================================================

const exportRegistrationsSchema = z.object({
  editionId: z.string().uuid(),
  distanceId: z.string().uuid().optional(),
  status: z.enum(REGISTRATION_STATUS).optional(),
  search: z.string().max(200).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const exportAddOnSalesSchema = z.object({
  editionId: z.string().uuid(),
});

// =============================================================================
// Actions
// =============================================================================

/**
 * Export registrations as CSV.
 * This action creates an audit log for PII disclosure.
 */
export const exportRegistrationsCSV = withAuthenticatedUser<ActionResult<{ csv: string; filename: string }>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof exportRegistrationsSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = exportRegistrationsSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, distanceId, status, search, dateFrom, dateTo } = validated.data;

  // Verify edition and get org info
  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    with: { series: true },
  });

  if (!edition?.series) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  // Check permission - need export permission
  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, editionId);
    try {
      requireOrgPermission(membership, 'canExportRegistrations');
    } catch {
      return { ok: false, error: 'Permission denied. You need export permissions.', code: 'FORBIDDEN' };
    }
  }

  const parseDateBoundary = (value: string | undefined, kind: 'start' | 'end') => {
    if (!value) return undefined;
    const date = new Date(`${value}T${kind === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };

  const createdFrom = parseDateBoundary(dateFrom, 'start');
  const createdTo = parseDateBoundary(dateTo, 'end');

  // Get registrations
  const registrations = await getRegistrationsForExport(editionId, {
    distanceId,
    status,
    search,
    createdFrom,
    createdTo,
  });

  // Create audit log for PII disclosure
  const requestContext = await getRequestContext(await headers());
  await createAuditLog({
    organizationId: edition.series.organizationId,
    actorUserId: authContext.user.id,
    action: 'registration.export',
    entityType: 'event_edition',
    entityId: editionId,
    after: {
      exportedCount: registrations.length,
      filters: { distanceId, status, search, dateFrom, dateTo },
      exportType: 'csv',
    },
    request: requestContext,
  });

  // Convert to CSV
  const csv = convertToCSV(registrations);
  const filename = `registrations-${edition.series.slug}-${edition.slug}-${new Date().toISOString().split('T')[0]}.csv`;

  return {
    ok: true,
    data: { csv, filename },
  };
});

/**
 * Export add-on sales summary as CSV.
 */
export const exportAddOnSalesCSV = withAuthenticatedUser<ActionResult<{ csv: string; filename: string }>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof exportAddOnSalesSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = exportAddOnSalesSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId } = validated.data;

  // Verify edition and get org info
  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    with: { series: true },
  });

  if (!edition?.series) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  // Check permission
  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, editionId);
    try {
      requireOrgPermission(membership, 'canExportRegistrations');
    } catch {
      return { ok: false, error: 'Permission denied. You need export permissions.', code: 'FORBIDDEN' };
    }
  }

  // Get add-on sales
  const sales = await getAddOnSalesSummary(editionId);

  // Create audit log
  const requestContext = await getRequestContext(await headers());
  await createAuditLog({
    organizationId: edition.series.organizationId,
    actorUserId: authContext.user.id,
    action: 'add_on_sales.export',
    entityType: 'event_edition',
    entityId: editionId,
    after: {
      exportedCount: sales.length,
      exportType: 'csv',
    },
    request: requestContext,
  });

  // Convert to CSV
  const csv = convertAddOnSalesToCSV(
    sales.map((s) => ({
      addOnTitle: s.addOnTitle,
      optionLabel: s.optionLabel,
      totalQuantity: s.totalQuantity,
      totalRevenueCents: s.totalRevenueCents,
    })),
  );
  const filename = `add-on-sales-${edition.series.slug}-${edition.slug}-${new Date().toISOString().split('T')[0]}.csv`;

  return {
    ok: true,
    data: { csv, filename },
  };
});

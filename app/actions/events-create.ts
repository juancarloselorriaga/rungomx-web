'use server';

import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import { type FormActionResult, validateInput } from '@/lib/forms';
import { createEventEdition, createEventSeries } from '@/lib/events/actions';
import { normalizeEditionDateTimeForPersistence } from '@/lib/events/ai-wizard/datetime';
import { SPORT_TYPES } from '@/lib/events/constants';
import { z } from 'zod';

const createEventStepSchema = z
  .object({
    organizationId: z.string().uuid(),
    selectedSeriesId: z.string().uuid().nullable().optional(),
    showNewSeries: z.boolean(),
    seriesName: z.string().optional().default(''),
    seriesSlug: z.string().optional().default(''),
    sportType: z.enum(SPORT_TYPES),
    editionLabel: z.string().min(1, 'EDITION_LABEL_REQUIRED'),
    editionSlug: z.string().min(1, 'EDITION_SLUG_REQUIRED'),
    description: z.string(),
    organizerBrief: z.string().optional(),
    startsAt: z.string(),
    address: z.string(),
    city: z.string(),
    state: z.string(),
    latitude: z.string(),
    longitude: z.string(),
    locationDisplay: z.string(),
    showAiContextDisclosure: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.showNewSeries) {
      if (!data.seriesName.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['seriesName'],
          message: 'SERIES_NAME_REQUIRED',
        });
      }

      if (!data.seriesSlug.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['seriesSlug'],
          message: 'SERIES_SLUG_REQUIRED',
        });
      }

      return;
    }

    if (!data.selectedSeriesId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['selectedSeriesId'],
        message: 'SERIES_REQUIRED',
      });
    }
  });

type CreateEventStepResult = FormActionResult<{ eventId: string }>;

export const createEventStepAction = withAuthenticatedUser<CreateEventStepResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(createEventStepSchema, input, {
    validationMessage: 'VALIDATION_ERROR',
    issueMapper: (issue) => issue.message,
  });

  if (!validation.success) {
    return validation.error;
  }

  const values = validation.data;

  const canAccessEvents =
    authContext.permissions.canViewOrganizersDashboard || authContext.permissions.canManageEvents;

  if (!canAccessEvents) {
    return { ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' };
  }

  let seriesId = values.selectedSeriesId ?? null;

  if (values.showNewSeries || !seriesId) {
    const seriesResult = await createEventSeries({
      organizationId: values.organizationId,
      name: values.seriesName.trim(),
      slug: values.seriesSlug.trim(),
      sportType: values.sportType,
    });

    if (!seriesResult.ok) {
      return {
        ok: false,
        error:
          seriesResult.code === 'UNAUTHENTICATED'
            ? 'UNAUTHENTICATED'
            : seriesResult.code === 'FORBIDDEN'
              ? 'FORBIDDEN'
              : 'SERVER_ERROR',
        message: seriesResult.code ?? 'SERVER_ERROR',
      };
    }

    seriesId = seriesResult.data.id;
  }

  const editionResult = await createEventEdition({
    seriesId,
    editionLabel: values.editionLabel.trim(),
    slug: values.editionSlug.trim(),
    description: values.description.trim() || undefined,
    organizerBrief: values.showAiContextDisclosure
      ? values.organizerBrief?.trim() || undefined
      : undefined,
    timezone: 'America/Mexico_City',
    country: 'MX',
    startsAt: values.startsAt
      ? (normalizeEditionDateTimeForPersistence(
          `${values.startsAt}T07:00`,
          'America/Mexico_City',
        ) ?? undefined)
      : undefined,
    address: values.address.trim() || undefined,
    city: values.city.trim() || undefined,
    state: values.state.trim() || undefined,
    latitude: values.latitude || undefined,
    longitude: values.longitude || undefined,
    locationDisplay: values.locationDisplay || undefined,
  });

  if (!editionResult.ok) {
    return {
      ok: false,
      error:
        editionResult.code === 'UNAUTHENTICATED'
          ? 'UNAUTHENTICATED'
          : editionResult.code === 'FORBIDDEN'
            ? 'FORBIDDEN'
            : 'SERVER_ERROR',
      message: editionResult.code ?? 'SERVER_ERROR',
    };
  }

  return { ok: true, data: { eventId: editionResult.data.id } };
});

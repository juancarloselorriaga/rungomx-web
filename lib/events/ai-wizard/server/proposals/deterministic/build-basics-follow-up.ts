import type { EventAiWizardPatch } from '@/lib/events/ai-wizard/schemas';
import { buildResolvedLocationEditionData } from '@/lib/events/ai-wizard/server/proposals/finalize/location-choice';
import type { resolveAiWizardLocationIntent } from '@/lib/events/ai-wizard/location-resolution';

const monthIndexByName: Record<string, number> = {
  enero: 0,
  feb: 1,
  febrero: 1,
  mar: 2,
  marzo: 2,
  abr: 3,
  abril: 3,
  may: 4,
  mayo: 4,
  jun: 5,
  junio: 5,
  jul: 6,
  julio: 6,
  ago: 7,
  agosto: 7,
  sep: 8,
  sept: 8,
  septiembre: 8,
  oct: 9,
  octubre: 9,
  nov: 10,
  noviembre: 10,
  dic: 11,
  diciembre: 11,
  jan: 0,
  january: 0,
  february: 1,
  march: 2,
  apr: 3,
  april: 3,
  june: 5,
  july: 6,
  aug: 7,
  august: 7,
  september: 8,
  octuber: 9,
  october: 9,
  november: 10,
  december: 11,
};

function buildUtcIsoDate(year: number, monthIndex: number, day: number) {
  const value = new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function parseDistanceValueFromText(latestUserText: string) {
  const match = latestUserText.match(/(\d+(?:[.,]\d+)?)\s*(km|k|mi|millas?)/i);
  if (!match) return null;

  const rawValue = match[1]?.replace(',', '.');
  const parsedValue = rawValue ? Number(rawValue) : NaN;
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) return null;

  const rawUnit = match[2]?.toLowerCase() ?? 'km';
  const unit = rawUnit.startsWith('mi') ? 'mi' : 'km';

  return {
    distanceValue: parsedValue,
    distanceUnit: unit as 'km' | 'mi',
    label: `${Number.isInteger(parsedValue) ? parsedValue.toFixed(0) : parsedValue} ${unit}`,
  };
}

function parsePriceFromText(latestUserText: string) {
  const currencyMatch = latestUserText.match(/\$?\s*(\d+(?:[.,]\d+)?)\s*(mxn|usd)\b/i);
  const explicitPriceMatch =
    latestUserText.match(
      /(?:precio(?:\s+inicial)?|price(?:\s+starting)?)(?:\s+de|\s*:)?\s*\$?\s*(\d+(?:[.,]\d+)?)/i,
    ) ?? latestUserText.match(/por\s+\$?\s*(\d+(?:[.,]\d+)?)/i);

  const amountText = currencyMatch?.[1] ?? explicitPriceMatch?.[1] ?? null;
  if (!amountText) return null;

  const amount = Number(amountText.replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0) return null;

  return {
    price: amount,
    currency: (currencyMatch?.[2]?.toUpperCase() ?? 'MXN') as 'MXN' | 'USD',
  };
}

function parseStartDateFromText(latestUserText: string) {
  const normalized = latestUserText.trim();
  if (!normalized) return null;

  const slashMatch = normalized.match(
    /\b(?:fecha\s+de\s+inicio(?:\s+(?:para|ser[aá]))?\s*)?(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/i,
  );
  if (slashMatch && /fecha\s+de\s+inicio/i.test(normalized)) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return buildUtcIsoDate(year, month - 1, day);
    }
  }

  const namedMonthMatch = normalized.match(
    /\b(?:fecha\s+de\s+inicio(?:\s+(?:para|ser[aá]))?\s*|usa\s+)?(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})\s+como\s+fecha\s+de\s+inicio\b/i,
  );
  if (namedMonthMatch) {
    const day = Number(namedMonthMatch[1]);
    const year = Number(namedMonthMatch[3]);
    const monthName = namedMonthMatch[2]
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    const monthIndex = monthIndexByName[monthName];
    if (day >= 1 && day <= 31 && monthIndex !== undefined) {
      return buildUtcIsoDate(year, monthIndex, day);
    }
  }

  const englishMonthMatch = normalized.match(
    /\b(?:start\s+date\s+(?:is|for|to)?\s*|use\s+)?([a-z]+)\s+(\d{1,2}),?\s+(\d{4})\s+(?:as|for)\s+the\s+start\s+date\b/i,
  );
  if (englishMonthMatch) {
    const day = Number(englishMonthMatch[2]);
    const year = Number(englishMonthMatch[3]);
    const monthIndex = monthIndexByName[englishMonthMatch[1].toLowerCase()];
    if (day >= 1 && day <= 31 && monthIndex !== undefined) {
      return buildUtcIsoDate(year, monthIndex, day);
    }
  }

  return null;
}

function parseEndDateFromText(latestUserText: string) {
  const normalized = latestUserText.trim();
  if (!normalized) return null;

  const slashMatch = normalized.match(
    /\b(?:fecha\s+de\s+fin(?:\s+(?:para|ser[aá]))?\s*)?(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/i,
  );
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return buildUtcIsoDate(year, month - 1, day);
    }
  }

  const namedMonthMatch = normalized.match(
    /\b(?:fecha\s+de\s+fin(?:\s+(?:para|ser[aá]))?\s*|usa\s+)?(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})\s+como\s+fecha\s+de\s+fin\b/i,
  );
  if (namedMonthMatch) {
    const day = Number(namedMonthMatch[1]);
    const year = Number(namedMonthMatch[3]);
    const monthName = namedMonthMatch[2]
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    const monthIndex = monthIndexByName[monthName];
    if (day >= 1 && day <= 31 && monthIndex !== undefined) {
      return buildUtcIsoDate(year, monthIndex, day);
    }
  }

  const englishMonthMatch = normalized.match(
    /\b(?:end\s+date\s+(?:is|for|to)?\s*|use\s+)?([a-z]+)\s+(\d{1,2}),?\s+(\d{4})\s+(?:as|for)\s+the\s+end\s+date\b/i,
  );
  if (englishMonthMatch) {
    const day = Number(englishMonthMatch[2]);
    const year = Number(englishMonthMatch[3]);
    const monthIndex = monthIndexByName[englishMonthMatch[1].toLowerCase()];
    if (day >= 1 && day <= 31 && monthIndex !== undefined) {
      return buildUtcIsoDate(year, monthIndex, day);
    }
  }

  return null;
}

export function buildDeterministicBasicsFollowUpPatch(args: {
  editionId: string;
  locale?: string;
  latestUserText: string;
  resolvedLocation: Awaited<ReturnType<typeof resolveAiWizardLocationIntent>> | null;
}) {
  const distance = parseDistanceValueFromText(args.latestUserText);
  const price = parsePriceFromText(args.latestUserText);
  const startsAt = parseStartDateFromText(args.latestUserText);
  const endsAt = parseEndDateFromText(args.latestUserText);
  const ops: EventAiWizardPatch['ops'] = [];
  const locale = (args.locale ?? 'es').toLowerCase();
  const isEnglish = locale.startsWith('en');
  const ambiguousLocation =
    args.resolvedLocation?.status === 'ambiguous' ? args.resolvedLocation : null;
  const hasAmbiguousLocation = Boolean(ambiguousLocation);

  if (args.resolvedLocation?.status === 'matched') {
    ops.push({
      type: 'update_edition',
      editionId: args.editionId,
      data: buildResolvedLocationEditionData(args.resolvedLocation.candidate),
    });
  }

  if (hasAmbiguousLocation) {
    ops.push({
      type: 'update_edition',
      editionId: args.editionId,
      data: {
        locationDisplay: ambiguousLocation?.query,
      },
    });
  }

  if (startsAt || endsAt) {
    const existingEditionUpdate = ops.find(
      (op): op is Extract<EventAiWizardPatch['ops'][number], { type: 'update_edition' }> =>
        op.type === 'update_edition',
    );

    if (existingEditionUpdate) {
      if (startsAt) existingEditionUpdate.data.startsAt = startsAt;
      if (endsAt) existingEditionUpdate.data.endsAt = endsAt;
    } else {
      ops.push({
        type: 'update_edition',
        editionId: args.editionId,
        data: {
          ...(startsAt ? { startsAt } : {}),
          ...(endsAt ? { endsAt } : {}),
        },
      });
    }
  }

  if (distance && price) {
    ops.push({
      type: 'create_distance',
      editionId: args.editionId,
      data: {
        label: distance.label,
        distanceValue: distance.distanceValue,
        distanceUnit: distance.distanceUnit,
        price: price.price,
      },
    });
  }

  if (!ops.length) return null;

  const hasEditionUpdate = ops.some((op) => op.type === 'update_edition');
  const hasDistanceCreation = ops.some((op) => op.type === 'create_distance');
  const hasDateDetail = Boolean(startsAt || endsAt);

  const title =
    hasEditionUpdate && hasDistanceCreation
      ? isEnglish
        ? hasAmbiguousLocation
          ? 'Choose the exact location and create the first distance'
          : hasDateDetail
            ? 'Complete Basics and create the first distance'
            : 'Confirm location and create the first distance'
        : hasAmbiguousLocation
          ? 'Elegir la ubicación exacta y crear la primera distancia'
          : hasDateDetail
            ? 'Completar Aspectos básicos y crear la primera distancia'
            : 'Confirmar ubicación y crear la primera distancia'
      : hasEditionUpdate
        ? isEnglish
          ? hasAmbiguousLocation
            ? 'Choose the exact event location'
            : hasDateDetail
              ? 'Complete Basics details'
              : 'Confirm the event location'
          : hasAmbiguousLocation
            ? 'Elegir la ubicación exacta del evento'
            : hasDateDetail
              ? 'Completar los detalles de Aspectos básicos'
              : 'Confirmar la ubicación del evento'
        : isEnglish
          ? 'Create the first distance'
          : 'Crear la primera distancia';

  const summary =
    hasEditionUpdate && hasDistanceCreation
      ? isEnglish
        ? hasAmbiguousLocation
          ? 'Choose the correct location first, then this proposal will also add the first distance with its starting price.'
          : hasDateDetail
            ? 'This proposal completes the pending Basics detail and also adds the first distance with its starting price.'
            : 'This proposal saves the matched event location and adds the first distance with its starting price.'
        : hasAmbiguousLocation
          ? 'Primero elige la ubicación correcta y esta propuesta también agregará la primera distancia con su precio inicial.'
          : hasDateDetail
            ? 'Esta propuesta completa el detalle pendiente de Aspectos básicos y también agrega la primera distancia con su precio inicial.'
            : 'Esta propuesta guarda la ubicación confirmada del evento y agrega la primera distancia con su precio inicial.'
      : hasEditionUpdate
        ? isEnglish
          ? hasAmbiguousLocation
            ? 'Choose the correct location before applying it to the real event fields.'
            : hasDateDetail
              ? 'This proposal fills the pending Basics detail in the real event fields.'
              : 'This proposal saves the matched location in the real event fields.'
          : hasAmbiguousLocation
            ? 'Elige la ubicación correcta antes de aplicarla en los campos reales del evento.'
            : hasDateDetail
              ? 'Esta propuesta llena el detalle pendiente de Aspectos básicos en los campos reales del evento.'
              : 'Esta propuesta guarda la ubicación confirmada en los campos reales del evento.'
        : isEnglish
          ? 'This proposal adds the first distance with the starting price you provided.'
          : 'Esta propuesta agrega la primera distancia con el precio inicial que indicaste.';

  return {
    title,
    summary,
    ops,
  } satisfies EventAiWizardPatch;
}

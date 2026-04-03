import type { EventAiWizardPatch } from '@/lib/events/ai-wizard/schemas';
import type { EventEditionDetail } from '@/lib/events/queries';

const monthIndexByName: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function buildUtcIsoDate(year: number, monthIndex: number, day: number) {
  const value = new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function parseIsoDateFromFragment(fragment: string | null | undefined) {
  const normalized = fragment?.trim();
  if (!normalized) return null;

  const slashMatch = normalized.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/i);
  if (slashMatch) {
    return buildUtcIsoDate(Number(slashMatch[3]), Number(slashMatch[2]) - 1, Number(slashMatch[1]));
  }

  const namedMonthMatch = normalized.match(/\b(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})\b/i);
  if (namedMonthMatch) {
    const monthName = namedMonthMatch[2]
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    const monthIndex = monthIndexByName[monthName];
    if (monthIndex !== undefined) {
      return buildUtcIsoDate(Number(namedMonthMatch[3]), monthIndex, Number(namedMonthMatch[1]));
    }
  }

  const englishMonthMatch = normalized.match(/\b([a-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (englishMonthMatch) {
    const monthIndex = monthIndexByName[englishMonthMatch[1].toLowerCase()];
    if (monthIndex !== undefined) {
      return buildUtcIsoDate(
        Number(englishMonthMatch[3]),
        monthIndex,
        Number(englishMonthMatch[2]),
      );
    }
  }

  return null;
}

function extractPolicyClause(latestUserText: string, keywords: string[], stopKeywords: string[]) {
  const normalized = latestUserText.trim();
  if (!normalized) return null;

  const keywordPattern = keywords.join('|');
  const stopPattern = stopKeywords.length > 0 ? `(?=${stopKeywords.join('|')}|$)` : '$';
  const regex = new RegExp(`(?:${keywordPattern})([\\s\\S]{0,220}?)${stopPattern}`, 'i');
  const match = normalized.match(regex);
  return match ? `${match[0]}`.trim() : null;
}

function formatPolicyDateLabel(isoDate: string, locale: string | undefined) {
  const normalizedLocale = (locale ?? 'es').toLowerCase();
  const formatter = new Intl.DateTimeFormat(normalizedLocale.startsWith('en') ? 'en-US' : 'es-MX', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return formatter.format(new Date(isoDate));
}

function parseRelativeDaysBeforeEvent(fragment: string | null | undefined) {
  const normalized = fragment
    ?.trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  if (!normalized) return null;

  const spanishMatch = normalized.match(/\b(\d{1,3})\s+dias?\s+antes\s+del?\s+evento\b/i);
  if (spanishMatch) return Number(spanishMatch[1]);

  const englishMatch = normalized.match(/\b(\d{1,3})\s+days?\s+before\s+the\s+event\b/i);
  if (englishMatch) return Number(englishMatch[1]);

  return null;
}

function subtractUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() - days);
  return next.toISOString();
}

type DeterministicPolicyClause = {
  kind: 'refund' | 'transfer' | 'deferral';
  enabled: boolean;
  markdown: string;
  deadline: string | null;
};

export function buildDeterministicPoliciesFollowUpPatch(args: {
  editionId: string;
  locale?: string;
  latestUserText: string;
  event: EventEditionDetail;
}) {
  const locale = (args.locale ?? 'es').toLowerCase();
  const isEnglish = locale.startsWith('en');
  const text = args.latestUserText;

  const refundClause = extractPolicyClause(
    text,
    ['reembolsos?', 'refunds?'],
    ['transferencias?', 'transfers?', 'diferimientos?', 'deferrals?'],
  );
  const transferClause = extractPolicyClause(
    text,
    ['transferencias?', 'transfers?'],
    ['reembolsos?', 'refunds?', 'diferimientos?', 'deferrals?'],
  );
  const deferralClause = extractPolicyClause(
    text,
    ['diferimientos?', 'deferrals?'],
    ['reembolsos?', 'refunds?', 'transferencias?', 'transfers?'],
  );
  const clauses: DeterministicPolicyClause[] = [];

  if (refundClause) {
    const deadline = parseIsoDateFromFragment(refundClause);
    const adminFeePercent = refundClause.match(/(\d{1,2})\s*%/i)?.[1] ?? null;
    const deadlineLabel = deadline ? formatPolicyDateLabel(deadline, locale) : null;
    clauses.push({
      kind: 'refund',
      enabled: true,
      deadline,
      markdown: isEnglish
        ? [
            '### Refunds',
            deadlineLabel
              ? `Refund requests are accepted through **${deadlineLabel}**.`
              : 'Refund requests are reviewed by the Race Director.',
            adminFeePercent
              ? `An administrative fee of **${adminFeePercent}%** applies to the original registration amount.`
              : 'Any administrative conditions follow the Race Director review process.',
            'After the cutoff, the registration is treated as final.',
          ].join('\n\n')
        : [
            '### Reembolsos',
            deadlineLabel
              ? `Se aceptan solicitudes de reembolso hasta el **${deadlineLabel}**.`
              : 'Las solicitudes de reembolso se revisan por el canal oficial del organizador.',
            adminFeePercent
              ? `Se aplica un cargo administrativo del **${adminFeePercent}%** sobre el monto original de la inscripción.`
              : 'Las condiciones administrativas se revisan según el proceso del organizador.',
            'Después de esa fecha, la inscripción se considera final.',
          ].join('\n\n'),
    });
  }

  if (transferClause) {
    const deadline = parseIsoDateFromFragment(transferClause);
    const deadlineLabel = deadline ? formatPolicyDateLabel(deadline, locale) : null;
    clauses.push({
      kind: 'transfer',
      enabled: true,
      deadline,
      markdown: isEnglish
        ? [
            '### Transfers',
            deadlineLabel
              ? `Participant transfers are allowed through **${deadlineLabel}**.`
              : 'Participant transfers are allowed with Race Director approval.',
            'The transfer keeps the same paid price and current registration conditions unless the Race Director confirms a different exception.',
          ].join('\n\n')
        : [
            '### Transferencias',
            deadlineLabel
              ? `Las transferencias de titular se permiten hasta el **${deadlineLabel}**.`
              : 'Las transferencias de titular se revisan por el canal oficial del organizador.',
            'La transferencia conserva el precio pagado y las condiciones vigentes de la inscripción, salvo confirmación distinta del organizador.',
          ].join('\n\n'),
    });
  }

  const deferralDisallowed =
    /\bsin\s+diferimientos?\b|no\s+hay\s+diferimientos?\b|without\s+deferrals?\b|no\s+deferrals?\b/i.test(
      text,
    );

  if (deferralClause || deferralDisallowed) {
    const relativeDeadlineDays = parseRelativeDaysBeforeEvent(deferralClause);
    const deadline =
      parseIsoDateFromFragment(deferralClause) ||
      (relativeDeadlineDays !== null && args.event.startsAt
        ? subtractUtcDays(args.event.startsAt, relativeDeadlineDays)
        : null);
    const deadlineLabel = deadline ? formatPolicyDateLabel(deadline, locale) : null;
    const normalizedDeferralClause =
      deferralClause
        ?.normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase() ?? '';
    const mentionsInjuryOnly = /\blesion\b|\binjury\b/i.test(normalizedDeferralClause);
    const requiresMedicalProof =
      /\bcomprobante\b|\bconstancia\b|\bcertificado\b|\bmedical\b|\bproof\b/i.test(
        normalizedDeferralClause,
      );

    clauses.push({
      kind: 'deferral',
      enabled: !deferralDisallowed,
      deadline,
      markdown: deferralDisallowed
        ? isEnglish
          ? ['### Deferrals', 'Deferrals are not available for this event.'].join('\n\n')
          : [
              '### Diferimientos',
              'No hay opción de diferir la inscripción para otra edición de este evento.',
            ].join('\n\n')
        : isEnglish
          ? [
              '### Deferrals',
              mentionsInjuryOnly
                ? 'Deferrals are allowed only for injury cases confirmed by the Race Director.'
                : 'Deferrals are allowed only under the Race Director rule described below.',
              requiresMedicalProof
                ? 'Medical proof is required to review and approve the deferral request.'
                : 'The Race Director will review the request against the documented eligibility rule.',
              deadlineLabel
                ? `The request must be submitted no later than **${deadlineLabel}**.`
                : relativeDeadlineDays !== null
                  ? `The request must be submitted no later than **${relativeDeadlineDays} days before the event**.`
                  : 'The request must respect the Race Director deadline already provided.',
              requiresMedicalProof || mentionsInjuryOnly
                ? 'Requests that do not meet these conditions will not qualify for deferral.'
                : 'Requests that fall outside these conditions will not qualify for deferral.',
            ].join('\n\n')
          : [
              '### Diferimientos',
              mentionsInjuryOnly
                ? 'El diferimiento solo se permite en casos de lesión confirmados por el organizador.'
                : 'El diferimiento solo se permite bajo la regla específica indicada por el organizador.',
              requiresMedicalProof
                ? 'Se debe presentar comprobante médico para revisar y aprobar la solicitud.'
                : 'La solicitud se revisa conforme a la condición documentada por el organizador.',
              deadlineLabel
                ? `La solicitud debe enviarse a más tardar el **${deadlineLabel}**.`
                : relativeDeadlineDays !== null
                  ? `La solicitud debe enviarse a más tardar **${relativeDeadlineDays} días antes del evento**.`
                  : 'La solicitud debe respetar el plazo ya indicado por el organizador.',
              requiresMedicalProof || mentionsInjuryOnly
                ? 'Las solicitudes fuera de estas condiciones no califican para diferimiento.'
                : 'Las solicitudes que no cumplan con estas condiciones no califican para diferimiento.',
            ].join('\n\n'),
    });
  }

  if (!clauses.length) return null;

  const current = args.event.policyConfig;
  const opData: Record<string, string | boolean | null | undefined> = {
    refundsAllowed: current?.refundsAllowed ?? false,
    refundPolicyText: current?.refundPolicyText ?? null,
    refundDeadline: current?.refundDeadline?.toISOString() ?? null,
    transfersAllowed: current?.transfersAllowed ?? false,
    transferPolicyText: current?.transferPolicyText ?? null,
    transferDeadline: current?.transferDeadline?.toISOString() ?? null,
    deferralsAllowed: current?.deferralsAllowed ?? false,
    deferralPolicyText: current?.deferralPolicyText ?? null,
    deferralDeadline: current?.deferralDeadline?.toISOString() ?? null,
  };

  for (const clause of clauses) {
    if (clause.kind === 'refund') {
      opData.refundsAllowed = clause.enabled;
      opData.refundPolicyText = clause.markdown;
      opData.refundDeadline = clause.deadline;
    } else if (clause.kind === 'transfer') {
      opData.transfersAllowed = clause.enabled;
      opData.transferPolicyText = clause.markdown;
      opData.transferDeadline = clause.deadline;
    } else {
      opData.deferralsAllowed = clause.enabled;
      opData.deferralPolicyText = clause.markdown;
      opData.deferralDeadline = clause.deadline;
    }
  }

  return {
    title: isEnglish ? 'Clarify participant policies' : 'Aclarar políticas para participantes',
    summary: isEnglish
      ? 'This proposal rewrites the public policy text with the dates and rules you just confirmed.'
      : 'Esta propuesta reescribe las políticas para participantes con las fechas y reglas que acabas de confirmar.',
    ops: [
      {
        type: 'update_policy_config' as const,
        editionId: args.editionId,
        data: opData,
      },
    ],
    markdownOutputs: clauses.map((clause) => ({
      domain: 'policy' as const,
      contentMarkdown: clause.markdown,
    })),
  } satisfies EventAiWizardPatch;
}

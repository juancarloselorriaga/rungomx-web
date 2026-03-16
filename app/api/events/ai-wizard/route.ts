import { NextResponse } from 'next/server';
import {
  tool,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  stepCountIs,
  type UIMessageStreamWriter,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

import { requireAuthenticatedUser } from '@/lib/auth/guards';
import { checkRateLimit } from '@/lib/rate-limit';
import { getEventEditionDetail } from '@/lib/events/queries';
import { getAddOnsForEdition } from '@/lib/events/add-ons/queries';
import { getQuestionsForEdition } from '@/lib/events/questions/queries';
import { canUserAccessSeries, hasOrgPermission } from '@/lib/organizations/permissions';
import { ProFeatureAccessError, requireProFeature } from '@/lib/pro-features/server/guard';
import { trackProFeatureEvent } from '@/lib/pro-features/server/tracking';
import { buildEventAiWizardSystemPrompt } from '@/lib/events/ai-wizard/prompt';
import {
  eventAiWizardChoiceRequestSchema,
  eventAiWizardCrossStepIntentSchema,
  eventAiWizardPatchSchema,
  type EventAiWizardCrossStepIntent,
  type EventAiWizardPatch,
} from '@/lib/events/ai-wizard/schemas';
import { evaluateAiWizardTextSafety, extractLatestUserText } from '@/lib/events/ai-wizard/safety';
import { extractLocationIntentQuery, resolveAiWizardLocationIntent } from '@/lib/events/ai-wizard/location-resolution';
import type {
  EventAiWizardEarlyProseLead,
  EventAiWizardFastPathKind,
  EventAiWizardFastPathStructure,
  EventAiWizardUIMessage,
} from '@/lib/events/ai-wizard/ui-types';
import { buildEventWizardAggregate } from '@/lib/events/wizard/orchestrator';
import { getPublicWebsiteContent, hasWebsiteContent } from '@/lib/events/website/queries';
import type { WebsiteContentBlocks } from '@/lib/events/website/types';
import {
  buildAssistantLocationResolutionOptions,
  buildLocationResolutionQueryFromEditionUpdate,
  resolveAssistantLocationQuery,
} from '@/lib/events/ai-wizard/location-resolution';

export const maxDuration = 30;

type SupportedLocale = 'es' | 'en';

const fastPathDescriptionProposalSchema = z
  .object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(400),
    descriptionMarkdown: z.string().min(1).max(5000),
    locationDisplay: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
  })
  .strict();

const fastPathFaqProposalSchema = z
  .object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(400),
    items: z
      .array(
        z
          .object({
            question: z.string().min(1).max(500),
            answerMarkdown: z.string().min(1).max(5000),
          })
          .strict(),
      )
      .min(2)
      .max(4),
  })
  .strict();

const fastPathContentBundleProposalSchema = z
  .object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(400),
    faqItems: z
      .array(
        z
          .object({
            question: z.string().min(1).max(500),
            answerMarkdown: z.string().min(1).max(5000),
          })
          .strict(),
      )
      .min(2)
      .max(4),
    websiteOverviewMarkdown: z.string().min(1).max(10000),
    websiteSectionTitle: z.string().max(255).optional(),
  })
  .strict();

const fastPathWebsiteOverviewProposalSchema = z
  .object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(400),
    markdown: z.string().min(1).max(10000),
    sectionTitle: z.string().max(255).optional(),
  })
  .strict();

const fastPathPolicyProposalSchema = z
  .object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(400),
    policy: z.enum(['refund', 'transfer', 'deferral']),
    markdown: z.string().min(1).max(5000),
  })
  .strict();

const requestSchema = z
  .object({
    editionId: z.string().uuid(),
    stepId: z.enum(['basics', 'distances', 'pricing', 'registration', 'policies', 'content', 'extras', 'review']),
    locale: z.string().min(2).max(10).optional(),
    eventBrief: z.string().max(4000).nullable().optional(),
    messages: z.array(z.unknown()),
  })
  .passthrough();

function normalizeUiMessagesForModelConversion(messages: unknown[]): EventAiWizardUIMessage[] {
  return messages
    .filter((message): message is Record<string, unknown> => Boolean(message && typeof message === 'object'))
    .map((message, index) => {
      const role = message.role;
      if (
        role !== 'system' &&
        role !== 'user' &&
        role !== 'assistant'
      ) {
        return null;
      }

      const rawParts = Array.isArray(message.parts) ? message.parts : null;
      const normalizedParts =
        rawParts && rawParts.length > 0
          ? rawParts
          : typeof message.content === 'string' && message.content.trim()
            ? [{ type: 'text', text: message.content }]
            : [];

      return {
        ...(message as Record<string, unknown>),
        id: typeof message.id === 'string' && message.id ? message.id : `msg-${index}`,
        role,
        parts: normalizedParts,
      } as EventAiWizardUIMessage;
    })
    .filter((message): message is EventAiWizardUIMessage => Boolean(message));
}

function mapIssueStepId(
  stepId: ReturnType<typeof buildEventWizardAggregate>['prioritizedChecklist'][number]['stepId'],
) {
  switch (stepId) {
    case 'event_details':
      return 'basics' as const;
    case 'distances':
      return 'distances' as const;
    case 'pricing':
      return 'pricing' as const;
    case 'waivers':
    case 'policies':
      return 'policies' as const;
    case 'faq':
    case 'website':
      return 'content' as const;
    case 'questions':
    case 'add_ons':
      return 'extras' as const;
    case 'publish':
      return 'review' as const;
    default:
      return 'basics' as const;
  }
}

function getDiagnosisNextStep(
  stepId: z.infer<typeof requestSchema>['stepId'],
  aggregate: ReturnType<typeof buildEventWizardAggregate>,
) {
  return (
    aggregate.prioritizedChecklist
      .map((issue) => ({
        ...issue,
        stepId: mapIssueStepId(issue.stepId),
      }))
      .find((issue) => issue.stepId !== stepId) ?? null
  );
}

function proFeatureErrorToResponse(error: ProFeatureAccessError) {
  if (error.decision.status === 'disabled') {
    return NextResponse.json({ code: 'FEATURE_DISABLED' }, { status: 503 });
  }
  return NextResponse.json({ code: 'PRO_REQUIRED' }, { status: 403 });
}

function canUseAssistantWithMembership(role: Parameters<typeof hasOrgPermission>[0]) {
  return (
    hasOrgPermission(role, 'canEditEventConfig') &&
    hasOrgPermission(role, 'canEditRegistrationSettings')
  );
}

function normalizeFastPathText(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function isStepGapDiagnosisRequest(
  stepId: z.infer<typeof requestSchema>['stepId'],
  latestUserText: string,
) {
  if (
    stepId !== 'basics' &&
    stepId !== 'pricing' &&
    stepId !== 'policies' &&
    stepId !== 'content' &&
    stepId !== 'review'
  ) {
    return false;
  }

  const normalized = normalizeFastPathText(latestUserText);
  if (!normalized.trim()) return false;

  const asksAboutMissing =
    normalized.includes('que falta') ||
    normalized.includes('que faltan') ||
    normalized.includes('faltan') ||
    normalized.includes('falta') ||
    normalized.includes('missing') ||
    normalized.includes('pendiente') ||
    normalized.includes('pendientes') ||
    normalized.includes('pending') ||
    normalized.includes('bloquea') ||
    normalized.includes('bloquean') ||
    normalized.includes('bloqueando') ||
    normalized.includes('bloqueo') ||
    normalized.includes('bloqueos') ||
    normalized.includes('blocker') ||
    normalized.includes('blockers') ||
    normalized.includes('blocking') ||
    normalized.includes('blocked');
  const asksAboutCurrentStep =
    stepId === 'basics'
      ? normalized.includes('aspectos basicos') ||
        normalized.includes('basics') ||
        normalized.includes('basico') ||
        normalized.includes('basicos')
      : stepId === 'pricing'
        ? normalized.includes('precios') ||
          normalized.includes('pricing') ||
          normalized.includes('tarifas') ||
          normalized.includes('precio')
        : stepId === 'policies'
          ? normalized.includes('politicas') ||
            normalized.includes('policies') ||
            normalized.includes('exenciones') ||
            normalized.includes('waivers')
          : stepId === 'content'
            ? normalized.includes('contenido') ||
              normalized.includes('content') ||
              normalized.includes('faq') ||
              normalized.includes('preguntas frecuentes') ||
              normalized.includes('website') ||
              normalized.includes('sitio')
            : normalized.includes('revision') ||
              normalized.includes('review') ||
              normalized.includes('publicacion') ||
              normalized.includes('publicar') ||
              normalized.includes('publish');

  return asksAboutMissing && asksAboutCurrentStep;
}

function shouldForceBasicsFollowUpProposal(
  stepId: z.infer<typeof requestSchema>['stepId'],
  latestUserText: string,
  locationIntentQuery: string | null,
) {
  if (stepId !== 'basics') return false;

  const normalized = normalizeFastPathText(latestUserText);
  if (!normalized.trim()) return false;

  const hasActionVerb =
    normalized.includes('crea') ||
    normalized.includes('crear') ||
    normalized.includes('agrega') ||
    normalized.includes('agregar') ||
    normalized.includes('anade') ||
    normalized.includes('añade') ||
    normalized.includes('configura') ||
    normalized.includes('configurar') ||
    normalized.includes('usa ') ||
    normalized.includes('usar ') ||
    normalized.includes('actualiza') ||
    normalized.includes('actualizar') ||
    normalized.includes('set ') ||
    normalized.includes('add ') ||
    normalized.includes('create ');

  const mentionsDistance =
    normalized.includes('distancia') ||
    normalized.includes('distancias') ||
    normalized.includes('distance') ||
    normalized.includes('distances') ||
    /\b\d+\s?(km|k)\b/.test(normalized);

  const mentionsPricing =
    normalized.includes('precio') ||
    normalized.includes('precios') ||
    normalized.includes('price') ||
    normalized.includes('pricing') ||
    normalized.includes('mxn') ||
    normalized.includes('usd') ||
    normalized.includes('$');

  return Boolean(locationIntentQuery || hasActionVerb && (mentionsDistance || mentionsPricing));
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
    latestUserText.match(/(?:precio(?:\s+inicial)?|price(?:\s+starting)?)(?:\s+de|\s*:)?\s*\$?\s*(\d+(?:[.,]\d+)?)/i) ??
    latestUserText.match(/por\s+\$?\s*(\d+(?:[.,]\d+)?)/i);

  const amountText = currencyMatch?.[1] ?? explicitPriceMatch?.[1] ?? null;
  if (!amountText) return null;

  const amount = Number(amountText.replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0) return null;

  return {
    price: amount,
    currency: (currencyMatch?.[2]?.toUpperCase() ?? 'MXN') as 'MXN' | 'USD',
  };
}

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
    const monthName = englishMonthMatch[1].toLowerCase();
    const monthIndex = monthIndexByName[monthName];
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
    const monthName = englishMonthMatch[1].toLowerCase();
    const monthIndex = monthIndexByName[monthName];
    if (day >= 1 && day <= 31 && monthIndex !== undefined) {
      return buildUtcIsoDate(year, monthIndex, day);
    }
  }

  return null;
}

function parseIsoDateFromFragment(fragment: string | null | undefined) {
  const normalized = fragment?.trim();
  if (!normalized) return null;

  const slashMatch = normalized.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/i);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return buildUtcIsoDate(year, month - 1, day);
    }
  }

  const namedMonthMatch = normalized.match(/\b(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})\b/i);
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

  const englishMonthMatch = normalized.match(/\b([a-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (englishMonthMatch) {
    const day = Number(englishMonthMatch[2]);
    const year = Number(englishMonthMatch[3]);
    const monthName = englishMonthMatch[1].toLowerCase();
    const monthIndex = monthIndexByName[monthName];
    if (day >= 1 && day <= 31 && monthIndex !== undefined) {
      return buildUtcIsoDate(year, monthIndex, day);
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

type DeterministicPolicyClause = {
  kind: 'refund' | 'transfer' | 'deferral';
  enabled: boolean;
  markdown: string;
  deadline: string | null;
};

function buildDeterministicPoliciesFollowUpPatch(args: {
  editionId: string;
  locale?: string;
  latestUserText: string;
  event: NonNullable<Awaited<ReturnType<typeof getEventEditionDetail>>>;
}) {
  const locale = (args.locale ?? 'es').toLowerCase();
  const isEnglish = locale.startsWith('en');
  const text = args.latestUserText;

  const refundClause = extractPolicyClause(text, ['reembolsos?', 'refunds?'], [
    'transferencias?',
    'transfers?',
    'diferimientos?',
    'deferrals?',
  ]);
  const transferClause = extractPolicyClause(text, ['transferencias?', 'transfers?'], [
    'reembolsos?',
    'refunds?',
    'diferimientos?',
    'deferrals?',
  ]);
  const deferralClause = extractPolicyClause(text, ['diferimientos?', 'deferrals?'], [
    'reembolsos?',
    'refunds?',
    'transferencias?',
    'transfers?',
  ]);

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
              : 'Refund requests will be reviewed through the organizer channel.',
            adminFeePercent
              ? `An administrative fee of **${adminFeePercent}%** applies to the original registration amount.`
              : 'Administrative conditions apply according to the organizer review process.',
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
              : 'Participant transfers are allowed through the organizer channel.',
            'The transfer keeps the same paid price and current registration conditions unless the organizer confirms something different.',
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

  if (deferralClause || /\bsin\s+diferimientos?\b|no\s+hay\s+diferimientos?\b|without\s+deferrals?\b|no\s+deferrals?\b/i.test(text)) {
    clauses.push({
      kind: 'deferral',
      enabled: false,
      deadline: null,
      markdown: isEnglish
        ? [
            '### Deferrals',
            'Deferrals are not available for this event.',
          ].join('\n\n')
        : [
            '### Diferimientos',
            'No hay opción de diferir la inscripción para otra edición de este evento.',
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
      ? 'This proposal rewrites the participant-facing policy fields with the dates and rules you just confirmed.'
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

function buildDeterministicBasicsFollowUpPatch(args: {
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
      data: {
        locationDisplay: args.resolvedLocation.candidate.formattedAddress,
        address: args.resolvedLocation.candidate.formattedAddress,
        city: args.resolvedLocation.candidate.city ?? null,
        state: args.resolvedLocation.candidate.region ?? null,
        latitude: String(args.resolvedLocation.candidate.lat),
        longitude: String(args.resolvedLocation.candidate.lng),
      },
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
      if (startsAt) {
        existingEditionUpdate.data.startsAt = startsAt;
      }
      if (endsAt) {
        existingEditionUpdate.data.endsAt = endsAt;
      }
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

function detectFastPathKind(
  stepId: z.infer<typeof requestSchema>['stepId'],
  latestUserText: string,
): EventAiWizardFastPathKind | null {
  const normalized = normalizeFastPathText(latestUserText);
  const hasSubstantialRequest = normalized.replace(/\s+/g, ' ').trim().length >= 12;

  const asksForFaq =
    /\bfaq\b/.test(normalized) ||
    normalized.includes('preguntas frecuentes') ||
    /\bpreguntas\b/.test(normalized) ||
    normalized.includes('common questions');
  const asksForPolicy =
    normalized.includes('politica') ||
    normalized.includes('politicas') ||
    normalized.includes('policy') ||
    normalized.includes('policies') ||
    normalized.includes('waiver') ||
    normalized.includes('reglamento') ||
    normalized.includes('terminos');
  const asksForWebsite =
    normalized.includes('website') ||
    normalized.includes('sitio') ||
    normalized.includes('landing') ||
    normalized.includes('pagina') ||
    normalized.includes('overview');
  const asksForDescription =
    normalized.includes('descripcion') ||
    normalized.includes('description') ||
    normalized.includes('summary') ||
    normalized.includes('resumen') ||
    normalized.includes('copy') ||
    normalized.includes('texto para participantes') ||
    normalized.includes('contenido para participantes') ||
    normalized.includes('participant content');
  const asksForSiteSummary =
    normalized.includes('texto del sitio') ||
    normalized.includes('resumen del sitio') ||
    normalized.includes('website summary') ||
    normalized.includes('site summary');

  if (stepId === 'policies' && asksForPolicy) return 'policy';
  if (
    (stepId === 'content' || stepId === 'review') &&
    asksForFaq &&
    (asksForWebsite || asksForSiteSummary)
  ) {
    return 'content_bundle';
  }
  if ((stepId === 'content' || stepId === 'review') && asksForFaq) return 'faq';
  if ((stepId === 'content' || stepId === 'review') && asksForWebsite) return 'website_overview';
  if ((stepId === 'content' || stepId === 'review') && asksForDescription) {
    return 'website_overview';
  }
  if (stepId === 'basics' && asksForDescription) {
    return 'event_description';
  }

  if (hasSubstantialRequest) {
    if (stepId === 'policies') return 'policy';
    if (stepId === 'content') return 'website_overview';
    if (stepId === 'review') return 'website_overview';
  }

  return null;
}

function countRequestedPolicyKinds(latestUserText: string) {
  const normalized = normalizeFastPathText(latestUserText);
  let count = 0;

  if (
    normalized.includes('reembolso') ||
    normalized.includes('reembolsos') ||
    normalized.includes('refund') ||
    normalized.includes('refunds')
  ) {
    count += 1;
  }
  if (
    normalized.includes('transferencia') ||
    normalized.includes('transferencias') ||
    normalized.includes('transfer') ||
    normalized.includes('transfers')
  ) {
    count += 1;
  }
  if (
    normalized.includes('diferimiento') ||
    normalized.includes('diferimientos') ||
    normalized.includes('deferral') ||
    normalized.includes('deferrals')
  ) {
    count += 1;
  }

  return count;
}

function resolvePreferredFastPathKind(
  stepId: z.infer<typeof requestSchema>['stepId'],
  latestUserText: string,
  crossStepIntent: EventAiWizardCrossStepIntent | null,
): EventAiWizardFastPathKind | null {
  if (stepId === 'policies' && countRequestedPolicyKinds(latestUserText) > 1) {
    return null;
  }

  const directFastPathKind = detectFastPathKind(stepId, latestUserText);
  if (directFastPathKind) return directFastPathKind;

  if (!crossStepIntent || crossStepIntent.requiresUserChoice) {
    return null;
  }

  switch (crossStepIntent.intentType) {
    case 'faq':
      return 'faq';
    case 'website_overview':
      return 'website_overview';
    case 'mixed_content':
      return 'content_bundle';
    case 'policy':
      return 'policy';
    case 'participant_content':
      return 'website_overview';
    case 'event_description':
      return 'event_description';
    default:
      return null;
  }
}

export function resolveCrossStepIntent(
  stepId: z.infer<typeof requestSchema>['stepId'],
  latestUserText: string,
): EventAiWizardCrossStepIntent | null {
  const normalized = normalizeFastPathText(latestUserText);
  if (!normalized.trim()) return null;

  const asksForFaq =
    /\bfaq\b/.test(normalized) ||
    normalized.includes('preguntas frecuentes') ||
    normalized.includes('common questions');
  const asksForPolicy =
    normalized.includes('politica') ||
    normalized.includes('politicas') ||
    normalized.includes('policy') ||
    normalized.includes('policies') ||
    normalized.includes('waiver') ||
    normalized.includes('reglamento') ||
    normalized.includes('terminos') ||
    normalized.includes('exencion') ||
    normalized.includes('exenciones');
  const asksForWebsite =
    normalized.includes('website') ||
    normalized.includes('sitio') ||
    normalized.includes('landing') ||
    normalized.includes('pagina') ||
    normalized.includes('overview');
  const asksForParticipantContent =
    normalized.includes('contenido para participantes') ||
    normalized.includes('participant content') ||
    normalized.includes('texto del sitio') ||
    normalized.includes('texto para participantes') ||
    normalized.includes('resumen del evento') ||
    normalized.includes('description') ||
    normalized.includes('descripcion') ||
    normalized.includes('summary') ||
    normalized.includes('copy');
  const asksForExtras =
    normalized.includes('preguntas de registro') ||
    normalized.includes('registration questions') ||
    normalized.includes('add-ons') ||
    normalized.includes('add ons') ||
    normalized.includes('extras') ||
    normalized.includes('merch') ||
    normalized.includes('addon');
  const asksForBasics =
    normalized.includes('ubicacion') ||
    normalized.includes('location') ||
    normalized.includes('fecha') ||
    normalized.includes('date') ||
    normalized.includes('hora') ||
    normalized.includes('time') ||
    normalized.includes('titulo') ||
    normalized.includes('title') ||
    normalized.includes('imagen') ||
    normalized.includes('image');

  const matchedTargets = [
    asksForFaq || asksForWebsite || asksForParticipantContent ? 'content' : null,
    asksForPolicy ? 'policies' : null,
    asksForExtras ? 'extras' : null,
  ].filter((value): value is 'content' | 'policies' | 'extras' => Boolean(value));

  if (matchedTargets.length === 0) return null;

  const uniqueTargets = Array.from(new Set(matchedTargets));
  const primaryTargetStepId = uniqueTargets[0];
  if (!primaryTargetStepId) return null;

  const scope: EventAiWizardCrossStepIntent['scope'] =
    asksForBasics && primaryTargetStepId !== stepId
      ? 'mixed'
      : primaryTargetStepId !== stepId
        ? 'cross_step'
        : 'current_step';

  let intentType: EventAiWizardCrossStepIntent['intentType'] = 'mixed_general';
  if (uniqueTargets.length > 1) {
    intentType = 'mixed_content';
  } else if (asksForFaq) {
    intentType = 'faq';
  } else if (asksForPolicy) {
    intentType = 'policy';
  } else if (asksForWebsite) {
    intentType = 'website_overview';
  } else if (asksForExtras) {
    intentType = 'extras';
  } else if (asksForParticipantContent) {
    intentType = 'participant_content';
  }

  return eventAiWizardCrossStepIntentSchema.parse({
    scope,
    sourceStepId: stepId,
    primaryTargetStepId,
    secondaryTargetStepIds: uniqueTargets.length > 1 ? uniqueTargets.slice(1) : undefined,
    intentType,
    confidence: uniqueTargets.length > 1 || scope === 'mixed' ? 'medium' : 'high',
    requiresUserChoice: uniqueTargets.length > 1 ? true : undefined,
    reasonCodes: [
      ...(asksForFaq ? ['faq_language'] : []),
      ...(asksForWebsite ? ['website_language'] : []),
      ...(asksForPolicy ? ['policy_language'] : []),
      ...(asksForExtras ? ['extras_language'] : []),
      ...(asksForParticipantContent ? ['participant_copy_language'] : []),
      ...(asksForBasics ? ['current_step_basics_language'] : []),
    ].slice(0, 6),
  });
}

function buildFastPathStructure(
  kind: EventAiWizardFastPathKind,
): EventAiWizardFastPathStructure {
  switch (kind) {
    case 'faq':
      return {
        kind,
        sectionKeys: ['event_basics', 'route_and_distances', 'registration_and_logistics'],
      };
    case 'website_overview':
      return {
        kind,
        sectionKeys: ['hero_positioning', 'confirmed_experience', 'what_to_confirm'],
      };
    case 'content_bundle':
      return {
        kind,
        sectionKeys: ['faq_answers', 'website_summary', 'confirmed_boundaries'],
      };
    case 'policy':
      return {
        kind,
        sectionKeys: ['core_rule', 'participant_responsibility', 'open_logistics'],
      };
    case 'event_description':
    default:
      return {
        kind: 'event_description',
        sectionKeys: ['lead', 'confirmed_highlights', 'pending_logistics'],
      };
  }
}

function buildEarlyProseLead(
  stepId: z.infer<typeof requestSchema>['stepId'],
  locale: string | undefined,
  event: Awaited<ReturnType<typeof getEventEditionDetail>>,
  fastPathKind: EventAiWizardFastPathKind | null,
): EventAiWizardEarlyProseLead | null {
  if (!event) return null;

  const normalizedLocale = (locale ?? 'es').toLowerCase();
  const isEnglish = normalizedLocale.startsWith('en');
  const eventName = [event.seriesName, event.editionLabel].filter(Boolean).join(' ');
  const place =
    event.locationDisplay?.trim() || [event.city, event.state].filter(Boolean).join(', ').trim();
  const distanceList = event.distances.map((distance) => distance.label).filter(Boolean);
  const distanceSummary =
    distanceList.length === 0
      ? null
      : distanceList.length === 1
        ? distanceList[0]
        : `${distanceList.slice(0, -1).join(', ')}${isEnglish ? ', and ' : ' y '}${distanceList.at(-1)}`;

  if (
    stepId === 'content' ||
    fastPathKind === 'faq' ||
    fastPathKind === 'website_overview' ||
    fastPathKind === 'content_bundle'
  ) {
    return {
      body: isEnglish
        ? `I’m starting from the confirmed details for ${eventName}${place ? ` in ${place}` : ''}${distanceSummary ? `, with ${distanceSummary}` : ''}. I’ll turn that into participant-facing copy first and leave any unconfirmed logistics out of the draft.`
        : `Voy a arrancar con los detalles confirmados de ${eventName}${place ? ` en ${place}` : ''}${distanceSummary ? `, con ${distanceSummary}` : ''}. Primero los convertiré en texto para participantes y dejaré fuera cualquier logística que siga sin confirmarse.`,
    };
  }

  if (stepId === 'policies' || fastPathKind === 'policy') {
    return {
      body: isEnglish
        ? `I’m drafting a clear first policy pass for ${eventName} using only the rules you already confirmed${place ? ` for ${place}` : ''}. Anything operational or legally sensitive will stay cautious instead of being guessed.`
        : `Voy a redactar una primera versión clara de políticas para ${eventName} usando solo las reglas que ya confirmaste${place ? ` para ${place}` : ''}. Todo lo operativo o delicado en lo legal se quedará prudente en vez de adivinarse.`,
    };
  }

  if (stepId === 'review') {
    return {
      body: isEnglish
        ? `I’m reviewing the confirmed setup for ${eventName} and will lead with the most useful publish-facing improvement first. I’ll point out what still needs confirmation instead of padding the recommendation with assumptions.`
        : `Estoy revisando la configuración confirmada de ${eventName} y voy a empezar por la mejora más útil de cara a publicación. Señalaré lo que todavía requiera confirmación en vez de rellenar la recomendación con supuestos.`,
    };
  }

  return null;
}

function emitPatch(writer: UIMessageStreamWriter<EventAiWizardUIMessage>, patch: EventAiWizardPatch) {
  const patchId = crypto.randomUUID();
  writer.write({
    type: 'data-notification',
    data: { code: 'finalizing_proposal', level: 'info' },
    transient: true,
  });
  writer.write({
    type: 'data-event-patch',
    id: patchId,
    data: patch,
  });
  return { patchId };
}

export async function enrichPatchWithResolvedLocation(
  event: NonNullable<Awaited<ReturnType<typeof getEventEditionDetail>>>,
  patch: EventAiWizardPatch,
  context: {
    stepId: z.infer<typeof requestSchema>['stepId'];
    locale?: string;
  },
) {
  if (context.stepId !== 'basics') {
    return patch;
  }

  let patchChanged = false;
  const resolutionOptions = buildAssistantLocationResolutionOptions(event, context.locale);
  const ops = await Promise.all(
    patch.ops.map(async (op) => {
      if (op.type !== 'update_edition' || op.editionId !== event.id) {
        return op;
      }

      const alreadyResolved = op.data.latitude?.trim() && op.data.longitude?.trim();
      if (alreadyResolved) {
        return op;
      }

      const query = buildLocationResolutionQueryFromEditionUpdate({
        locationDisplay: op.data.locationDisplay,
        address: op.data.address,
        city: op.data.city,
        state: op.data.state,
      });

      if (!query) {
        return op;
      }

      const resolution = await resolveAssistantLocationQuery(query, resolutionOptions);
      if (resolution.status !== 'matched') {
        return op;
      }

      patchChanged = true;
      return {
        ...op,
        data: {
          ...op.data,
          locationDisplay: resolution.match.formattedAddress,
          address: resolution.match.formattedAddress,
          city: resolution.match.city ?? op.data.city,
          state: resolution.match.region ?? op.data.state,
          latitude: String(resolution.match.lat),
          longitude: String(resolution.match.lng),
        },
      };
    }),
  );

  if (!patchChanged) {
    return patch;
  }

  return {
    ...patch,
    ops,
  } satisfies EventAiWizardPatch;
}

type WizardAggregateInput = Parameters<typeof buildEventWizardAggregate>[1];

function appendProjectedMarkdown(existing: string | null | undefined, incoming: string): string {
  const previous = (existing ?? '').trim();
  const next = incoming.trim();

  if (!previous) return next;
  if (!next || previous.includes(next)) return previous;
  return `${previous}\n\n${next}`;
}

function projectWebsiteContent(
  websiteContent: WebsiteContentBlocks | null | undefined,
  patch: EventAiWizardPatch,
): WebsiteContentBlocks | null {
  let projectedBlocks: WebsiteContentBlocks | null = websiteContent
    ? {
        ...websiteContent,
        overview: websiteContent.overview ? { ...websiteContent.overview } : undefined,
        course: websiteContent.course ? { ...websiteContent.course } : undefined,
        schedule: websiteContent.schedule
          ? {
              ...websiteContent.schedule,
              startTimes: websiteContent.schedule.startTimes?.map((item) => ({ ...item })),
            }
          : undefined,
      }
    : null;

  for (const op of patch.ops) {
    if (op.type !== 'append_website_section_markdown') continue;

    if (!projectedBlocks) {
      projectedBlocks = {};
    }

    if (op.data.section === 'overview') {
      const previous = projectedBlocks.overview ?? { type: 'overview' as const, enabled: true, content: '' };
      projectedBlocks.overview = {
        ...previous,
        enabled: true,
        title: previous.title ?? op.data.title,
        content: op.data.markdown.trim(),
      };
      continue;
    }

    if (op.data.section === 'course') {
      const previous = projectedBlocks.course ?? { type: 'course' as const, enabled: true };
      projectedBlocks.course = {
        ...previous,
        enabled: true,
        title: previous.title ?? op.data.title,
        description: appendProjectedMarkdown(previous.description, op.data.markdown),
      };
      continue;
    }

    const previous = projectedBlocks.schedule ?? { type: 'schedule' as const, enabled: true };
    projectedBlocks.schedule = {
      ...previous,
      enabled: true,
      title: previous.title ?? op.data.title,
      raceDay: appendProjectedMarkdown(previous.raceDay, op.data.markdown),
    };
  }

  return projectedBlocks;
}

function buildProjectedAggregate(
  event: NonNullable<Awaited<ReturnType<typeof getEventEditionDetail>>>,
  patch: EventAiWizardPatch,
  aggregateInput: WizardAggregateInput,
) {
  const projectedFaqItems = [
    ...event.faqItems,
    ...patch.ops
      .filter(
        (op): op is Extract<EventAiWizardPatch['ops'][number], { type: 'create_faq_item' }> =>
          op.type === 'create_faq_item',
      )
      .map((op, index) => ({
        id: `projected-faq-${index}`,
        question: op.data.question,
        answer: op.data.answerMarkdown,
        sortOrder: event.faqItems.length + index,
      })),
  ];
  const addedWaiverCount = patch.ops.filter((op) => op.type === 'create_waiver').length;
  const addedQuestionCount = patch.ops.filter((op) => op.type === 'create_question').length;
  const addedAddOnCount = patch.ops.filter((op) => op.type === 'create_add_on').length;
  const addsWebsiteContent = patch.ops.some((op) => op.type === 'append_website_section_markdown');
  const addsPolicyContent =
    patch.ops.some((op) => op.type === 'append_policy_markdown' || op.type === 'update_policy_config') ||
    addedWaiverCount > 0;
  const descriptionOp = patch.ops.find(
    (op): op is Extract<EventAiWizardPatch['ops'][number], { type: 'update_edition' }> =>
      op.type === 'update_edition',
  );
  const addedDistanceCount = patch.ops.filter((op) => op.type === 'create_distance').length;
  const pricingOpsCount = patch.ops.filter(
    (op) => op.type === 'create_pricing_tier' || op.type === 'update_distance_price',
  ).length;
  const policyConfigOp = patch.ops.find(
    (op): op is Extract<EventAiWizardPatch['ops'][number], { type: 'update_policy_config' }> =>
      op.type === 'update_policy_config',
  );
  const waiverTemplate = event.waivers[0];
  const distanceTemplate = event.distances[0];
  const projectedWebsiteContent = projectWebsiteContent(aggregateInput.websiteContent, patch);

  const projectedEvent = {
    ...event,
    description: descriptionOp?.data.description ?? event.description,
    timezone: descriptionOp?.data.timezone ?? event.timezone,
    startsAt:
      descriptionOp?.data.startsAt !== undefined
        ? descriptionOp.data.startsAt
          ? new Date(descriptionOp.data.startsAt)
          : null
        : event.startsAt,
    endsAt:
      descriptionOp?.data.endsAt !== undefined
        ? descriptionOp.data.endsAt
          ? new Date(descriptionOp.data.endsAt)
          : null
        : event.endsAt,
    locationDisplay: descriptionOp?.data.locationDisplay ?? event.locationDisplay,
    city: descriptionOp?.data.city ?? event.city,
    state: descriptionOp?.data.state ?? event.state,
    address: descriptionOp?.data.address ?? event.address,
    latitude: descriptionOp?.data.latitude ?? event.latitude,
    longitude: descriptionOp?.data.longitude ?? event.longitude,
    faqItems: projectedFaqItems,
    waivers: [
      ...event.waivers,
      ...Array.from({ length: addedWaiverCount }, (_, index) => ({
        ...(waiverTemplate ?? ({} as (typeof event.waivers)[number])),
        id: `projected-waiver-${index}`,
      })),
    ],
    policyConfig: addsPolicyContent
      ? {
          ...(event.policyConfig ?? ({} as NonNullable<typeof event.policyConfig>)),
          ...(policyConfigOp?.data.refundsAllowed !== undefined
            ? { refundsAllowed: policyConfigOp.data.refundsAllowed }
            : {}),
          ...(policyConfigOp?.data.refundPolicyText !== undefined
            ? { refundPolicyText: policyConfigOp.data.refundPolicyText }
            : {}),
          ...(policyConfigOp?.data.refundDeadline !== undefined
            ? {
                refundDeadline: policyConfigOp.data.refundDeadline
                  ? new Date(policyConfigOp.data.refundDeadline)
                  : null,
              }
            : {}),
          ...(policyConfigOp?.data.transfersAllowed !== undefined
            ? { transfersAllowed: policyConfigOp.data.transfersAllowed }
            : {}),
          ...(policyConfigOp?.data.transferPolicyText !== undefined
            ? { transferPolicyText: policyConfigOp.data.transferPolicyText }
            : {}),
          ...(policyConfigOp?.data.transferDeadline !== undefined
            ? {
                transferDeadline: policyConfigOp.data.transferDeadline
                  ? new Date(policyConfigOp.data.transferDeadline)
                  : null,
              }
            : {}),
          ...(policyConfigOp?.data.deferralsAllowed !== undefined
            ? { deferralsAllowed: policyConfigOp.data.deferralsAllowed }
            : {}),
          ...(policyConfigOp?.data.deferralPolicyText !== undefined
            ? { deferralPolicyText: policyConfigOp.data.deferralPolicyText }
            : {}),
          ...(policyConfigOp?.data.deferralDeadline !== undefined
            ? {
                deferralDeadline: policyConfigOp.data.deferralDeadline
                  ? new Date(policyConfigOp.data.deferralDeadline)
                  : null,
              }
            : {}),
        }
      : event.policyConfig,
    distances: [
      ...event.distances.map((distance) => ({
        ...distance,
        hasPricingTier: pricingOpsCount > 0 ? true : distance.hasPricingTier,
        pricingTierCount: pricingOpsCount > 0 ? Math.max(distance.pricingTierCount, 1) : distance.pricingTierCount,
        hasBoundedPricingTier:
          pricingOpsCount > 0
            ? true
            : distance.hasBoundedPricingTier,
      })),
      ...Array.from({ length: addedDistanceCount }, (_, index) => ({
        ...(distanceTemplate ?? ({} as (typeof event.distances)[number])),
        id: `projected-distance-${index}`,
        label: `Projected distance ${index + 1}`,
        distanceValue: distanceTemplate?.distanceValue ?? null,
        distanceUnit: distanceTemplate?.distanceUnit ?? 'km',
        hasPricingTier: true,
        pricingTierCount: 1,
        hasBoundedPricingTier: pricingOpsCount > 0,
      })),
    ],
  };

  return buildEventWizardAggregate(projectedEvent, {
    ...aggregateInput,
    hasWebsiteContent: aggregateInput.hasWebsiteContent || addsWebsiteContent,
    websiteContent: projectedWebsiteContent,
    questionCount: (aggregateInput.questionCount ?? 0) + addedQuestionCount,
    addOnCount: (aggregateInput.addOnCount ?? 0) + addedAddOnCount,
  });
}

function canonicalIntentForStep(stepId: ReturnType<typeof mapIssueStepId>) {
  return `continue_${stepId}`;
}

function patchTouchesLocation(patch: EventAiWizardPatch) {
  return patch.ops.some(
    (op) =>
      op.type === 'update_edition' &&
      Boolean(
        op.data.locationDisplay ||
          op.data.address ||
          op.data.city ||
          op.data.state ||
          op.data.latitude ||
          op.data.longitude,
      ),
  );
}

function normalizeWizardLocale(locale: string | null | undefined): SupportedLocale {
  return locale?.toLowerCase().startsWith('en') ? 'en' : 'es';
}

function getLocalizedWizardStepLabel(
  stepId: 'basics' | 'distances' | 'pricing' | 'registration' | 'policies' | 'content' | 'extras' | 'review',
  locale: SupportedLocale,
): string {
  const labels = {
    es: {
      basics: 'Aspectos básicos',
      distances: 'Distancias',
      pricing: 'Precios',
      registration: 'Inscripciones',
      policies: 'Políticas y exenciones',
      content: 'Contenido para participantes',
      extras: 'Preguntas y extras',
      review: 'Revisión y publicación',
    },
    en: {
      basics: 'Basics',
      distances: 'Distances',
      pricing: 'Pricing',
      registration: 'Registration',
      policies: 'Policies & waivers',
      content: 'Participant content',
      extras: 'Questions & extras',
      review: 'Review & publish',
    },
  } as const;

  return labels[locale][stepId];
}

function getLocalizedIssueText(
  issue: { code: string },
  locale: SupportedLocale,
): string {
  const map = {
    es: {
      MISSING_EVENT_DATE: 'Todavía falta confirmar la fecha de inicio del evento.',
      MISSING_EVENT_END_DATE: 'Todavía falta confirmar la fecha de fin del evento.',
      MISSING_EVENT_LOCATION: 'Todavía falta confirmar la ubicación exacta del evento.',
      MISSING_EVENT_DESCRIPTION: 'Todavía falta una descripción pública clara del evento.',
      MISSING_HERO_IMAGE: 'Sería bueno subir una imagen principal antes de publicar.',
      MISSING_DISTANCE: 'Todavía falta crear al menos una distancia.',
      MISSING_PRICING: 'Todavía falta configurar al menos una tarifa válida por distancia.',
      CONTENT_SCHEDULE_TRUTH_CONFLICT:
        'El contenido para participantes todavía dice que la fecha u hora no están confirmadas aunque la programación estructurada ya está guardada.',
      CONTENT_LOCATION_TRUTH_CONFLICT:
        'El contenido para participantes todavía dice que la ubicación no está confirmada aunque la ubicación estructurada del evento ya está guardada.',
      RECOMMEND_PRICING_WINDOWS:
        'Sería recomendable definir ventanas claras de preventa, regular o cierre.',
      RECOMMEND_WAIVERS: 'Sería recomendable agregar una exención para que los participantes acepten términos.',
      RECOMMEND_QUESTIONS: 'Sería recomendable agregar preguntas de registro para logística y preferencias.',
      RECOMMEND_FAQ: 'Sería recomendable agregar preguntas frecuentes para resolver dudas comunes.',
      RECOMMEND_WEBSITE: 'Sería recomendable completar el contenido del sitio del evento.',
      RECOMMEND_ADD_ONS: 'Sería recomendable configurar complementos si planeas ofrecer extras.',
      RECOMMEND_POLICIES: 'Sería recomendable dejar claras las políticas para participantes.',
    },
    en: {
      MISSING_EVENT_DATE: 'The event start date still needs to be confirmed.',
      MISSING_EVENT_END_DATE: 'The event end date still needs to be confirmed.',
      MISSING_EVENT_LOCATION: 'The exact event location still needs confirmation.',
      MISSING_EVENT_DESCRIPTION: 'A clear public event description is still missing.',
      MISSING_HERO_IMAGE: 'It would help to upload a main event image before publishing.',
      MISSING_DISTANCE: 'At least one distance still needs to be created.',
      MISSING_PRICING: 'At least one valid price per distance is still missing.',
      CONTENT_SCHEDULE_TRUTH_CONFLICT:
        'Participant-facing content still says the event date or time is unconfirmed even though the structured schedule is already saved.',
      CONTENT_LOCATION_TRUTH_CONFLICT:
        'Participant-facing content still says the location is unconfirmed even though the structured event location is already saved.',
      RECOMMEND_PRICING_WINDOWS:
        'It would still be helpful to define clear early, regular, or late price windows.',
      RECOMMEND_WAIVERS: 'It would help to add a waiver so participants can accept the event terms.',
      RECOMMEND_QUESTIONS: 'It would help to add registration questions for logistics and preferences.',
      RECOMMEND_FAQ: 'It would help to add FAQs for the most common participant questions.',
      RECOMMEND_WEBSITE: 'It would help to complete the event website content.',
      RECOMMEND_ADD_ONS: 'It would help to configure add-ons if you plan to offer extras.',
      RECOMMEND_POLICIES: 'It would help to make participant-facing policies clearer.',
    },
  } as const;

  return map[locale][issue.code as keyof (typeof map)[typeof locale]] ?? issue.code;
}

function buildDeterministicDiagnosisText({
  event,
  aggregate,
  stepId,
  locale,
  diagnosisNextStep,
  hasWebsiteContent,
}: {
  event: Awaited<ReturnType<typeof getEventEditionDetail>> extends infer T
    ? T extends null
      ? never
      : NonNullable<T>
    : never;
  aggregate: ReturnType<typeof buildEventWizardAggregate>;
  stepId: 'basics' | 'pricing' | 'policies' | 'content' | 'review';
  locale: SupportedLocale;
  diagnosisNextStep:
    | { stepId: 'basics' | 'distances' | 'pricing' | 'registration' | 'policies' | 'content' | 'extras' | 'review' }
    | null;
  hasWebsiteContent: boolean;
}): string {
  const diagnosis = aggregate.stepDiagnosisById?.[stepId] ?? [];
  const lines: string[] = [];

  if (stepId === 'pricing') {
    const activeDistances = event.distances.map((distance) => distance.label).filter(Boolean);
    const allHaveBoundedPricing =
      event.distances.length > 0 &&
      event.distances.every((distance) => distance.hasBoundedPricingTier);
    const maxTierCount = event.distances.reduce(
      (max, distance) => Math.max(max, distance.pricingTierCount),
      0,
    );

    lines.push(
      locale === 'es' ? 'Qué ya tiene Precios ahora' : 'What Pricing already has',
      locale === 'es'
        ? `Ya tienes distancias activas: ${activeDistances.join(', ')}.`
        : `You already have active distances: ${activeDistances.join(', ')}.`,
      allHaveBoundedPricing
        ? locale === 'es'
          ? 'Todas ya cuentan con niveles de precio por fecha.'
          : 'All of them already include date-based pricing tiers.'
        : locale === 'es'
          ? `Ya hay ${maxTierCount > 1 ? 'múltiples niveles de precio' : 'tarifas base'} configurados por distancia.`
          : `There ${maxTierCount > 1 ? 'are already multiple pricing tiers' : 'is already base pricing'} configured per distance.`,
      locale === 'es'
        ? `Moneda actual: ${event.distances[0]?.currency ?? 'MXN'}.`
        : `Current currency: ${event.distances[0]?.currency ?? 'MXN'}.`,
      '',
      locale === 'es'
        ? 'Qué falta o sería recomendable'
        : 'What is still missing or only recommended',
    );

    if (diagnosis.length === 0) {
      lines.push(
        locale === 'es'
          ? 'En Precios no falta nada importante por ahora.'
          : 'Pricing is already covered well enough for now.',
      );
    } else {
      lines.push(...diagnosis.map((issue) => `- ${getLocalizedIssueText(issue, locale)}`));
    }

    lines.push('', locale === 'es' ? 'Mejor siguiente paso ahora' : 'Best next step now');
    if (diagnosisNextStep) {
      const nextLabel = getLocalizedWizardStepLabel(diagnosisNextStep.stepId, locale);
      lines.push(
        locale === 'es'
          ? `Puedes seguir con ${nextLabel}.`
          : `You can continue with ${nextLabel}.`,
      );
    } else {
      lines.push(
        locale === 'es'
          ? 'Puedes continuar con el siguiente paso del wizard.'
          : 'You can continue with the next wizard step.',
      );
    }

    return lines.join('\n');
  }

  if (stepId === 'policies') {
    const hasPolicyCopy = Boolean(
      event.policyConfig?.refundPolicyText?.trim() ||
        event.policyConfig?.transferPolicyText?.trim() ||
        event.policyConfig?.deferralPolicyText?.trim(),
    );
    const hasWaivers = event.waivers.length > 0;

    lines.push(
      locale === 'es' ? 'Qué ya tiene Políticas ahora' : 'What Policies already has',
      hasPolicyCopy
        ? locale === 'es'
          ? 'Ya hay texto de políticas para participantes.'
          : 'There is already participant-facing policy copy saved.'
        : locale === 'es'
          ? 'Todavía no hay texto claro de políticas guardado.'
          : 'There is not clear saved policy copy yet.',
      hasWaivers
        ? locale === 'es'
          ? `Ya hay ${event.waivers.length} exención(es) configurada(s).`
          : `${event.waivers.length} waiver(s) are already configured.`
        : locale === 'es'
          ? 'Todavía no hay exenciones configuradas.'
          : 'No waivers are configured yet.',
      '',
      locale === 'es'
        ? 'Qué falta o sería recomendable'
        : 'What is still missing or only recommended',
    );

    if (!hasPolicyCopy && !hasWaivers) {
      lines.push(
        locale === 'es'
          ? 'En este paso todavía conviene definir al menos una política clara para participantes.'
          : 'It would still help to define at least one clear participant-facing policy in this step.',
      );
    } else {
      lines.push(
        locale === 'es'
          ? 'En Políticas no hay nada que bloquee el flujo por ahora, aunque todavía se puede reforzar la claridad antes de publicar.'
          : 'Nothing in Policies blocks the flow right now, although clarity can still be improved before publishing.',
      );
    }

    lines.push('', locale === 'es' ? 'Mejor siguiente paso ahora' : 'Best next step now');
    if (diagnosisNextStep) {
      const nextLabel = getLocalizedWizardStepLabel(diagnosisNextStep.stepId, locale);
      lines.push(
        locale === 'es' ? `Puedes seguir con ${nextLabel}.` : `You can continue with ${nextLabel}.`,
      );
    }

    return lines.join('\n');
  }

  if (stepId === 'content') {
    const hasFaq = event.faqItems.length > 0;
    const hasDescription = Boolean(event.description?.trim());
    lines.push(
      locale === 'es' ? 'Qué ya tiene Contenido ahora' : 'What Content already has',
      hasDescription
        ? locale === 'es'
          ? 'Ya existe una descripción pública base del evento.'
          : 'A base public event description already exists.'
        : locale === 'es'
          ? 'Todavía no hay una descripción pública base.'
          : 'There is no base public event description yet.',
      hasFaq
        ? locale === 'es'
          ? `Ya hay ${event.faqItems.length} pregunta(s) frecuente(s) guardada(s).`
          : `${event.faqItems.length} FAQ item(s) are already saved.`
        : locale === 'es'
          ? 'Todavía no hay preguntas frecuentes guardadas.'
          : 'No FAQs are saved yet.',
      hasWebsiteContent
        ? locale === 'es'
          ? 'Ya hay contenido guardado para el sitio del evento.'
          : 'There is already saved website content for the event.'
        : locale === 'es'
          ? 'Todavía no hay contenido adicional del sitio guardado.'
          : 'There is no additional saved website content yet.',
      '',
      locale === 'es'
        ? 'Qué falta o sería recomendable'
        : 'What is still missing or only recommended',
    );

    const contentRecommendations: string[] = [];
    if (!hasFaq) {
      contentRecommendations.push(
        locale === 'es'
          ? 'Sería recomendable agregar FAQ para resolver dudas frecuentes.'
          : 'It would help to add FAQs for the most common questions.',
      );
    }
    if (!hasWebsiteContent) {
      contentRecommendations.push(
        locale === 'es'
          ? 'Sería recomendable completar el contenido del sitio del evento.'
          : 'It would help to complete the event website content.',
      );
    }

    if (contentRecommendations.length === 0) {
      lines.push(
        locale === 'es'
          ? 'Contenido ya está suficientemente cubierto por ahora.'
          : 'Content is already covered well enough for now.',
      );
    } else {
      lines.push(...contentRecommendations.map((item) => `- ${item}`));
    }

    lines.push('', locale === 'es' ? 'Mejor siguiente paso ahora' : 'Best next step now');
    if (contentRecommendations.length > 0) {
      const currentLabel = getLocalizedWizardStepLabel('content', locale);
      lines.push(
        locale === 'es'
          ? `Conviene seguir aquí en ${currentLabel}.`
          : `It makes the most sense to keep going here in ${currentLabel}.`,
      );
    } else if (diagnosisNextStep) {
      const nextLabel = getLocalizedWizardStepLabel(diagnosisNextStep.stepId, locale);
      lines.push(
        locale === 'es' ? `Puedes seguir con ${nextLabel}.` : `You can continue with ${nextLabel}.`,
      );
    }

    return lines.join('\n');
  }

  if (stepId === 'review') {
    const publishBlockers = aggregate.publishBlockers ?? [];
    const optionalRecommendations = aggregate.optionalRecommendations ?? [];

    lines.push(
      locale === 'es' ? 'Qué ya tiene Revisión y publicación ahora' : 'What Review & publish already has',
      publishBlockers.length === 0
        ? locale === 'es'
          ? 'Ya no quedan bloqueos obligatorios para publicar.'
          : 'There are no required publish blockers left.'
        : locale === 'es'
          ? `Todavía hay ${publishBlockers.length} bloqueo(s) obligatorio(s) para publicar.`
          : `There are still ${publishBlockers.length} required blocker(s) before publishing.`,
      optionalRecommendations.length === 0
        ? locale === 'es'
          ? 'No hay mejoras opcionales pendientes en este momento.'
          : 'There are no optional improvements pending right now.'
        : locale === 'es'
          ? `Aún hay ${optionalRecommendations.length} mejora(s) recomendada(s) antes de publicar con más confianza.`
          : `There are still ${optionalRecommendations.length} recommended improvement(s) before publishing with more confidence.`,
      '',
      locale === 'es'
        ? 'Qué sigue bloqueando o conviene reforzar'
        : 'What still blocks publishing or is worth improving',
    );

    if (publishBlockers.length === 0) {
      lines.push(
        locale === 'es'
          ? 'Ya no hay bloqueos de publicación.'
          : 'There are no publication blockers left.',
      );
    } else {
      lines.push(...publishBlockers.map((issue) => `- ${getLocalizedIssueText(issue, locale)}`));
    }

    if (optionalRecommendations.length > 0) {
      lines.push(...optionalRecommendations.map((issue) => `- ${getLocalizedIssueText(issue, locale)}`));
    }

    lines.push('', locale === 'es' ? 'Mejor siguiente paso ahora' : 'Best next step now');
    if (diagnosisNextStep) {
      const nextLabel = getLocalizedWizardStepLabel(diagnosisNextStep.stepId, locale);
      lines.push(
        locale === 'es' ? `Puedes seguir con ${nextLabel}.` : `You can continue with ${nextLabel}.`,
      );
    } else {
      lines.push(
        locale === 'es'
          ? 'Puedes revisar la visibilidad y publicar cuando quieras.'
          : 'You can review visibility and publish whenever you are ready.',
      );
    }

    return lines.join('\n');
  }

  const hasExactLocation = Boolean(
    String(event.latitude ?? '').trim() && String(event.longitude ?? '').trim(),
  );
  lines.push(
    locale === 'es' ? 'Qué ya tiene Aspectos básicos ahora' : 'What Basics already has',
    event.startsAt
      ? locale === 'es'
        ? 'La fecha de inicio ya está confirmada.'
        : 'The start date is already confirmed.'
      : locale === 'es'
        ? 'La fecha de inicio todavía no está confirmada.'
        : 'The start date is not confirmed yet.',
    hasExactLocation
      ? locale === 'es'
        ? 'La ubicación ya está confirmada con referencia exacta.'
        : 'The location is already confirmed with exact reference.'
      : locale === 'es'
        ? 'La ubicación exacta todavía no está confirmada.'
        : 'The exact location is not confirmed yet.',
    event.description?.trim()
      ? locale === 'es'
        ? 'Ya hay una descripción pública inicial.'
        : 'There is already an initial public description.'
      : locale === 'es'
        ? 'Todavía falta una descripción pública inicial.'
        : 'An initial public description is still missing.',
    '',
    locale === 'es'
      ? 'Qué falta o sería recomendable'
      : 'What is still missing or only recommended',
  );

  if (diagnosis.length === 0) {
    lines.push(
      locale === 'es'
        ? 'Aspectos básicos ya está suficientemente cubierto por ahora.'
        : 'Basics is already covered well enough for now.',
    );
  } else {
    lines.push(...diagnosis.map((issue) => `- ${getLocalizedIssueText(issue, locale)}`));
  }

  lines.push('', locale === 'es' ? 'Mejor siguiente paso ahora' : 'Best next step now');
  if (diagnosisNextStep) {
    const nextLabel = getLocalizedWizardStepLabel(diagnosisNextStep.stepId, locale);
    lines.push(
      locale === 'es' ? `Puedes seguir con ${nextLabel}.` : `You can continue with ${nextLabel}.`,
    );
  } else {
    lines.push(
      locale === 'es'
        ? 'Puedes continuar con el siguiente paso del wizard.'
        : 'You can continue with the next wizard step.',
    );
  }

  return lines.join('\n');
}

function serializeResolvedLocationCandidate(
  candidate: NonNullable<
    Extract<
      Awaited<ReturnType<typeof resolveAiWizardLocationIntent>>,
      { status: 'matched' }
    >['candidate']
  >,
) {
  return {
    formattedAddress: candidate.formattedAddress,
    lat: candidate.lat,
    lng: candidate.lng,
    city: candidate.city,
    region: candidate.region,
    countryCode: candidate.countryCode,
    placeId: candidate.placeId,
    provider: candidate.provider,
  };
}

function sanitizeResolvedLocationForUi(
  resolvedLocation: Awaited<ReturnType<typeof resolveAiWizardLocationIntent>>,
): EventAiWizardPatch['locationResolution'] {
  if (resolvedLocation.status === 'matched') {
    return {
      status: 'matched',
      query: resolvedLocation.query,
      candidate: serializeResolvedLocationCandidate(resolvedLocation.candidate),
    };
  }

  if (resolvedLocation.status === 'ambiguous') {
    return {
      status: 'ambiguous',
      query: resolvedLocation.query,
      candidates: resolvedLocation.candidates.map((candidate) =>
        serializeResolvedLocationCandidate(candidate),
      ),
    };
  }

  return resolvedLocation;
}

function buildLocationChoiceRequest(
  resolvedLocation: Awaited<ReturnType<typeof resolveAiWizardLocationIntent>>,
) {
  if (resolvedLocation.status !== 'ambiguous') return undefined;

  return eventAiWizardChoiceRequestSchema.parse({
    kind: 'location_candidate_selection',
    selectionMode: 'single',
    sourceStepId: 'basics',
    targetField: 'event_location',
    query: resolvedLocation.query,
    options: resolvedLocation.candidates
      .map((candidate) => serializeResolvedLocationCandidate(candidate))
      .slice(0, 4),
  });
}

export function finalizeWizardPatchForUi(
  event: NonNullable<Awaited<ReturnType<typeof getEventEditionDetail>>>,
  patch: EventAiWizardPatch,
  aggregateInput: WizardAggregateInput,
  resolvedLocation?: Awaited<ReturnType<typeof resolveAiWizardLocationIntent>> | null,
  crossStepIntent?: EventAiWizardCrossStepIntent | null,
): EventAiWizardPatch {
  const projectedAggregate = buildProjectedAggregate(event, patch, aggregateInput);
  const projectedChecklist = [...projectedAggregate.publishBlockers, ...projectedAggregate.missingRequired].map((issue) => ({
    code: issue.code,
    stepId: mapIssueStepId(issue.stepId),
    label: issue.labelKey,
    severity: issue.severity,
  }));

  const canonicalIntentRouting = projectedAggregate.optionalRecommendations
    .map((issue) => mapIssueStepId(issue.stepId))
    .filter((stepId, index, list) => list.indexOf(stepId) === index)
    .slice(0, 3)
    .map((stepId) => ({
      intent: canonicalIntentForStep(stepId),
      stepId,
    }));

  return {
    ...patch,
    missingFieldsChecklist: projectedChecklist,
    intentRouting: canonicalIntentRouting,
    crossStepIntent: crossStepIntent ?? patch.crossStepIntent,
    locationResolution:
      resolvedLocation && patchTouchesLocation(patch)
        ? sanitizeResolvedLocationForUi(resolvedLocation)
        : patch.locationResolution,
    choiceRequest:
      resolvedLocation?.status === 'ambiguous'
        ? buildLocationChoiceRequest(resolvedLocation)
        : patch.choiceRequest,
  };
}

function buildFastPathPatch(
  kind: EventAiWizardFastPathKind,
  editionId: string,
  locale: string | undefined,
  proposal:
    | z.infer<typeof fastPathDescriptionProposalSchema>
    | z.infer<typeof fastPathFaqProposalSchema>
    | z.infer<typeof fastPathContentBundleProposalSchema>
    | z.infer<typeof fastPathWebsiteOverviewProposalSchema>
    | z.infer<typeof fastPathPolicyProposalSchema>,
): EventAiWizardPatch {
  switch (kind) {
    case 'faq': {
      const faqProposal = proposal as z.infer<typeof fastPathFaqProposalSchema>;
      return {
        title: faqProposal.title,
        summary: faqProposal.summary,
        ops: faqProposal.items.map((item) => ({
          type: 'create_faq_item' as const,
          editionId,
          data: {
            question: item.question,
            answerMarkdown: item.answerMarkdown,
          },
        })),
        markdownOutputs: faqProposal.items.map((item) => ({
          domain: 'faq' as const,
          contentMarkdown: item.answerMarkdown,
        })),
      };
    }
    case 'content_bundle': {
      const contentBundle = proposal as z.infer<typeof fastPathContentBundleProposalSchema>;
      return {
        title: contentBundle.title,
        summary: contentBundle.summary,
        ops: [
          ...contentBundle.faqItems.map((item) => ({
            type: 'create_faq_item' as const,
            editionId,
            data: {
              question: item.question,
              answerMarkdown: item.answerMarkdown,
            },
          })),
          {
            type: 'append_website_section_markdown' as const,
            editionId,
            data: {
              section: 'overview' as const,
              markdown: contentBundle.websiteOverviewMarkdown,
              title: contentBundle.websiteSectionTitle,
              locale: locale ?? 'es',
            },
          },
        ],
        markdownOutputs: [
          ...contentBundle.faqItems.map((item) => ({
            domain: 'faq' as const,
            contentMarkdown: item.answerMarkdown,
          })),
          {
            domain: 'website' as const,
            contentMarkdown: contentBundle.websiteOverviewMarkdown,
          },
        ],
      };
    }
    case 'website_overview': {
      const websiteProposal = proposal as z.infer<typeof fastPathWebsiteOverviewProposalSchema>;
      return {
        title: websiteProposal.title,
        summary: websiteProposal.summary,
        ops: [
          {
            type: 'append_website_section_markdown' as const,
            editionId,
            data: {
              section: 'overview' as const,
              markdown: websiteProposal.markdown,
              title: websiteProposal.sectionTitle,
              locale: locale ?? 'es',
            },
          },
        ],
        markdownOutputs: [
          {
            domain: 'website' as const,
            contentMarkdown: websiteProposal.markdown,
          },
        ],
      };
    }
    case 'policy': {
      const policyProposal = proposal as z.infer<typeof fastPathPolicyProposalSchema>;
      return {
        title: policyProposal.title,
        summary: policyProposal.summary,
        ops: [
          {
            type: 'append_policy_markdown' as const,
            editionId,
            data: {
              policy: policyProposal.policy,
              markdown: policyProposal.markdown,
              enable: true,
            },
          },
        ],
        markdownOutputs: [
          {
            domain: 'policy' as const,
            contentMarkdown: policyProposal.markdown,
          },
        ],
      };
    }
    case 'event_description':
    default: {
      const descriptionProposal = proposal as z.infer<typeof fastPathDescriptionProposalSchema>;
      return {
        title: descriptionProposal.title,
        summary: descriptionProposal.summary,
        ops: [
          {
            type: 'update_edition' as const,
            editionId,
            data: {
              description: descriptionProposal.descriptionMarkdown,
              locationDisplay: descriptionProposal.locationDisplay,
              city: descriptionProposal.city,
              state: descriptionProposal.state,
            },
          },
        ],
        markdownOutputs: [
          {
            domain: 'description' as const,
            contentMarkdown: descriptionProposal.descriptionMarkdown,
          },
        ],
      };
    }
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', details: parsed.error.issues }, { status: 400 });
  }

  const { editionId, stepId, locale, eventBrief, messages } = parsed.data;

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

  const event = await getEventEditionDetail(editionId);
  if (!event) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const membership = await canUserAccessSeries(authContext.user.id, event.seriesId);
  if (!membership) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  if (!canUseAssistantWithMembership(membership.role)) {
    return NextResponse.json({ code: 'READ_ONLY' }, { status: 403 });
  }

  const latestUserText = extractLatestUserText(messages);
  const safetyDecision = evaluateAiWizardTextSafety(latestUserText);
  if (safetyDecision.blocked) {
    await trackProFeatureEvent({
      featureKey: 'event_ai_wizard',
      userId: authContext.user.id,
      eventType: 'blocked',
      meta: {
        blockCategory: safetyDecision.category,
        blockReason: safetyDecision.reason,
        endpoint: 'stream',
        editionId,
      },
    });
    return NextResponse.json(
      {
        code: 'SAFETY_BLOCKED',
        category: safetyDecision.category,
        reason: safetyDecision.reason,
        endpoint: 'stream',
      },
      { status: 400 },
    );
  }

  const resolvedEventBrief = event.organizerBrief?.trim() || eventBrief?.trim() || null;
  const diagnosisMode = isStepGapDiagnosisRequest(stepId, latestUserText);
  const crossStepIntent = diagnosisMode ? null : resolveCrossStepIntent(stepId, latestUserText);
  const fastPathKind = diagnosisMode
    ? null
    : resolvePreferredFastPathKind(stepId, latestUserText, crossStepIntent);
  const locationIntentQuery = stepId === 'basics' ? extractLocationIntentQuery(latestUserText) : null;
  const forcePoliciesFollowUpProposal =
    !diagnosisMode &&
    stepId === 'policies' &&
    countRequestedPolicyKinds(latestUserText) > 1;
  const forceBasicsFollowUpProposal =
    !diagnosisMode &&
    !fastPathKind &&
    shouldForceBasicsFollowUpProposal(stepId, latestUserText, locationIntentQuery);
  const briefSafetyDecision = evaluateAiWizardTextSafety(resolvedEventBrief ?? '');
  if (briefSafetyDecision.blocked) {
    await trackProFeatureEvent({
      featureKey: 'event_ai_wizard',
      userId: authContext.user.id,
      eventType: 'blocked',
      meta: {
        blockCategory: briefSafetyDecision.category,
        blockReason: briefSafetyDecision.reason,
        endpoint: 'stream',
        editionId,
        blockInput: 'event_brief',
      },
    });
    return NextResponse.json(
      {
        code: 'SAFETY_BLOCKED',
        category: briefSafetyDecision.category,
        reason: briefSafetyDecision.reason,
        endpoint: 'stream',
      },
      { status: 400 },
    );
  }

  const [websiteContent, websiteEnabled, questions, addOns, resolvedLocation] = await Promise.all([
    getPublicWebsiteContent(editionId, locale ?? 'es'),
    hasWebsiteContent(editionId),
    getQuestionsForEdition(editionId),
    getAddOnsForEdition(editionId),
    locationIntentQuery
      ? resolveAiWizardLocationIntent(locationIntentQuery, {
          locale: locale ?? 'es',
          country: event.country ?? 'MX',
        })
      : Promise.resolve(null),
  ]);

  const streamRateLimit = await checkRateLimit(`${authContext.user.id}:${editionId}`, 'user', {
    action: 'event_ai_wizard_stream',
    maxRequests: 30,
    windowMs: 5 * 60 * 1000,
  });

  if (!streamRateLimit.allowed) {
    await trackProFeatureEvent({
      featureKey: 'event_ai_wizard',
      userId: authContext.user.id,
      eventType: 'blocked',
      meta: {
        blockCategory: 'rate_limit',
        endpoint: 'stream',
        editionId,
        resetAt: streamRateLimit.resetAt.toISOString(),
      },
    });
    return NextResponse.json(
      {
        code: 'RATE_LIMITED',
        category: 'rate_limit',
        endpoint: 'stream',
        resetAt: streamRateLimit.resetAt.toISOString(),
      },
      { status: 429 },
    );
  }

  const isCopyHeavyStep = stepId === 'policies' || stepId === 'content' || stepId === 'review';
  const aggregateInput = {
    selectedPath: null,
    hasWebsiteContent: websiteEnabled,
    websiteContent,
    questionCount: questions.length,
    addOnCount: addOns.length,
  } satisfies WizardAggregateInput;
  const fastModelName =
    process.env.EVENT_AI_WIZARD_FAST_MODEL ||
    'gpt-5-nano';
  const copyModelName =
    process.env.EVENT_AI_WIZARD_COPY_MODEL ||
    process.env.EVENT_AI_WIZARD_MODEL ||
    'gpt-5-mini';
  const modelName =
    (fastPathKind ? fastModelName : undefined) ||
    (isCopyHeavyStep ? copyModelName : undefined) ||
    process.env.EVENT_AI_WIZARD_MODEL ||
    copyModelName;
  const stepBudget = fastPathKind ? 4 : isCopyHeavyStep ? 6 : 8;
  const fastPathProviderOptions =
    fastPathKind && isCopyHeavyStep
      ? {
          openai: {
            reasoningEffort: 'minimal' as const,
            textVerbosity: 'low' as const,
          },
        }
      : undefined;

  const stream = createUIMessageStream<EventAiWizardUIMessage>({
    originalMessages: messages as EventAiWizardUIMessage[],
    execute: async ({ writer }) => {
      writer.write({
        type: 'data-notification',
        data: { code: 'analyzing_request', level: 'info' },
        transient: true,
      });

      const earlyProseLead = buildEarlyProseLead(stepId, locale, event, fastPathKind);
      if (earlyProseLead) {
        writer.write({
          type: 'data-early-prose',
          data: earlyProseLead,
          transient: true,
        });
      }

      if (fastPathKind) {
        writer.write({
          type: 'data-fast-path-structure',
          data: buildFastPathStructure(fastPathKind),
          transient: true,
        });
      }

      const aggregate = buildEventWizardAggregate(event, aggregateInput);
      const diagnosisNextStep = diagnosisMode ? getDiagnosisNextStep(stepId, aggregate) : null;
      const deterministicDiagnosisText =
        diagnosisMode &&
        (stepId === 'basics' ||
          stepId === 'pricing' ||
          stepId === 'policies' ||
          stepId === 'content' ||
          stepId === 'review')
          ? buildDeterministicDiagnosisText({
              event,
              aggregate,
              stepId,
              locale: normalizeWizardLocale(locale),
              diagnosisNextStep,
              hasWebsiteContent: websiteEnabled,
            })
          : null;
      const deterministicBasicsFollowUpPatch = forceBasicsFollowUpProposal
        ? buildDeterministicBasicsFollowUpPatch({
            editionId,
            locale,
            latestUserText,
            resolvedLocation,
          })
        : null;
      const deterministicPoliciesFollowUpPatch = forcePoliciesFollowUpProposal
        ? buildDeterministicPoliciesFollowUpPatch({
            editionId,
            locale,
            latestUserText,
            event,
          })
        : null;

      writer.write({
        type: 'data-notification',
        data: { code: 'grounding_snapshot', level: 'info' },
        transient: true,
      });
      writer.write({
        type: 'data-notification',
        data: { code: 'drafting_response', level: 'info' },
        transient: true,
      });

      if (deterministicDiagnosisText) {
        writer.write({
          type: 'text-start',
          id: `diagnosis-${stepId}`,
        });
        writer.write({
          type: 'text-delta',
          id: `diagnosis-${stepId}`,
          delta: deterministicDiagnosisText,
        });
        writer.write({
          type: 'text-end',
          id: `diagnosis-${stepId}`,
        });
        return;
      }

      const system = buildEventAiWizardSystemPrompt(event, {
        checklist: aggregate.prioritizedChecklist.map((issue) => ({
          ...issue,
          stepId: mapIssueStepId(issue.stepId),
        })),
        activeStepDiagnosis:
          aggregate.stepDiagnosisById?.[stepId]?.map((issue) => ({
            ...issue,
            stepId: mapIssueStepId(issue.stepId),
          })) ?? [],
        diagnosisNextStep,
        activeStepId: stepId,
        locale: locale ?? 'es',
        websiteContent,
        eventBrief: resolvedEventBrief,
        fastPathKind,
        compactMode: Boolean(fastPathKind && isCopyHeavyStep),
        locationResolution: resolvedLocation,
        diagnosisMode,
      });
      const modelMessages = await convertToModelMessages(
        normalizeUiMessagesForModelConversion(messages),
      );

      if (deterministicBasicsFollowUpPatch || deterministicPoliciesFollowUpPatch) {
        emitPatch(
          writer,
          finalizeWizardPatchForUi(
            event,
            deterministicBasicsFollowUpPatch ?? deterministicPoliciesFollowUpPatch!,
            aggregateInput,
            resolvedLocation,
            crossStepIntent,
          ),
        );
        return;
      }

      const baseTools = {
        proposeDescriptionPatch: tool({
          description:
            'Create the first reviewable patch for the event description only. Use this for broad copy-heavy content requests.',
          inputSchema: fastPathDescriptionProposalSchema,
          execute: async (proposal) => {
            const enrichedPatch = await enrichPatchWithResolvedLocation(
              event,
              buildFastPathPatch('event_description', editionId, locale, proposal),
              { stepId, locale },
            );
            return emitPatch(
              writer,
              finalizeWizardPatchForUi(
                event,
                enrichedPatch,
                aggregateInput,
                resolvedLocation,
                crossStepIntent,
              ),
            );
          },
        }),
        proposeFaqPatch: tool({
          description:
            'Create the first reviewable patch for FAQ content only. Keep it narrow and participant-facing.',
          inputSchema: fastPathFaqProposalSchema,
          execute: async (proposal) =>
            emitPatch(
              writer,
              finalizeWizardPatchForUi(
                event,
                buildFastPathPatch('faq', editionId, locale, proposal),
                aggregateInput,
                resolvedLocation,
                crossStepIntent,
              ),
            ),
        }),
        proposeContentBundlePatch: tool({
          description:
            'Create one reviewable patch that combines FAQ content plus website overview when the organizer explicitly asked for both.',
          inputSchema: fastPathContentBundleProposalSchema,
          execute: async (proposal) =>
            emitPatch(
              writer,
              finalizeWizardPatchForUi(
                event,
                buildFastPathPatch('content_bundle', editionId, locale, proposal),
                aggregateInput,
                resolvedLocation,
                crossStepIntent,
              ),
            ),
        }),
        proposeWebsiteOverviewPatch: tool({
          description:
            'Create the first reviewable patch for the website overview section only.',
          inputSchema: fastPathWebsiteOverviewProposalSchema,
          execute: async (proposal) =>
            emitPatch(
              writer,
              finalizeWizardPatchForUi(
                event,
                buildFastPathPatch('website_overview', editionId, locale, proposal),
                aggregateInput,
                resolvedLocation,
                crossStepIntent,
              ),
            ),
        }),
        proposePolicyPatch: tool({
          description:
            'Create the first reviewable patch for one participant-facing policy block only.',
          inputSchema: fastPathPolicyProposalSchema,
          execute: async (proposal) =>
            emitPatch(
              writer,
              finalizeWizardPatchForUi(
                event,
                buildFastPathPatch('policy', editionId, locale, proposal),
                aggregateInput,
                resolvedLocation,
                crossStepIntent,
              ),
            ),
        }),
        proposePatch: tool({
          description:
            'Propose a single patch of allowlisted operations for the current event edition. The user will review and apply it.',
          inputSchema: eventAiWizardPatchSchema,
          execute: async (patch) => {
            const enrichedPatch = await enrichPatchWithResolvedLocation(event, patch, {
              stepId,
              locale,
            });
            return emitPatch(
              writer,
              finalizeWizardPatchForUi(
                event,
                enrichedPatch,
                aggregateInput,
                resolvedLocation,
                crossStepIntent,
              ),
            );
          },
        }),
      };
      const streamConfig = {
        model: openai(modelName),
        providerOptions: fastPathProviderOptions,
        system,
        messages: modelMessages,
        stopWhen: stepCountIs(stepBudget),
      } as const;

      const result =
        diagnosisMode
          ? streamText({
              ...streamConfig,
            })
          : fastPathKind === 'event_description'
          ? streamText({
              ...streamConfig,
              toolChoice: { type: 'tool', toolName: 'proposeDescriptionPatch' },
              tools: {
                proposeDescriptionPatch: baseTools.proposeDescriptionPatch,
              },
            })
          : fastPathKind === 'faq'
            ? streamText({
                ...streamConfig,
                toolChoice: { type: 'tool', toolName: 'proposeFaqPatch' },
                tools: {
                  proposeFaqPatch: baseTools.proposeFaqPatch,
                },
              })
            : fastPathKind === 'content_bundle'
              ? streamText({
                  ...streamConfig,
                  toolChoice: { type: 'tool', toolName: 'proposeContentBundlePatch' },
                  tools: {
                    proposeContentBundlePatch: baseTools.proposeContentBundlePatch,
                  },
                })
            : fastPathKind === 'website_overview'
              ? streamText({
                  ...streamConfig,
                  toolChoice: { type: 'tool', toolName: 'proposeWebsiteOverviewPatch' },
                  tools: {
                    proposeWebsiteOverviewPatch: baseTools.proposeWebsiteOverviewPatch,
                  },
                })
              : fastPathKind === 'policy'
                ? streamText({
                    ...streamConfig,
                    toolChoice: { type: 'tool', toolName: 'proposePolicyPatch' },
                    tools: {
                      proposePolicyPatch: baseTools.proposePolicyPatch,
                    },
                })
              : streamText({
                  ...streamConfig,
                  toolChoice: forceBasicsFollowUpProposal || forcePoliciesFollowUpProposal
                    ? { type: 'tool', toolName: 'proposePatch' as const }
                    : undefined,
                    tools: {
                      proposePatch: baseTools.proposePatch,
                    },
                  });

      writer.merge(result.toUIMessageStream({ originalMessages: messages as EventAiWizardUIMessage[] }));
    },
  });

  return createUIMessageStreamResponse({ stream });
}

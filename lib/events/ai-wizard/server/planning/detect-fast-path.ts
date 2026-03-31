import type { EventAiWizardCrossStepIntent } from '@/lib/events/ai-wizard/schemas';
import type {
  EventAiWizardFastPathKind,
  EventAiWizardFastPathStructure,
} from '@/lib/events/ai-wizard/ui-types';
import type { EventAiWizardPlanningStepId } from './types';

function normalizeFastPathText(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function isGenericContentRefinementRequest(
  stepId: EventAiWizardPlanningStepId,
  latestUserText: string,
) {
  if (stepId !== 'content' && stepId !== 'review') {
    return false;
  }

  const normalized = normalizeFastPathText(latestUserText).trim();
  if (!normalized) return false;

  const explicitScopeCue =
    /\bfaq\b/.test(normalized) ||
    normalized.includes('preguntas frecuentes') ||
    normalized.includes('website') ||
    normalized.includes('sitio') ||
    normalized.includes('landing') ||
    normalized.includes('pagina') ||
    normalized.includes('overview');
  if (explicitScopeCue) {
    return false;
  }

  return (
    normalized.includes('hazlo') ||
    normalized.includes('mejoralo') ||
    normalized.includes('mejora') ||
    normalized.includes('pule') ||
    normalized.includes('pulir') ||
    normalized.includes('refina') ||
    normalized.includes('refinar') ||
    normalized.includes('mas claro') ||
    normalized.includes('mas confiable') ||
    normalized.includes('mas directo') ||
    normalized.includes('mas simple') ||
    normalized.includes('clearer') ||
    normalized.includes('more clear') ||
    normalized.includes('more trustworthy') ||
    normalized.includes('refine') ||
    normalized.includes('polish')
  );
}

function detectFastPathKind(
  stepId: EventAiWizardPlanningStepId,
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
  if ((stepId === 'content' || stepId === 'review') && asksForDescription)
    return 'website_overview';
  if (stepId === 'basics' && asksForDescription) return 'event_description';

  if (hasSubstantialRequest) {
    if (stepId === 'policies') return 'policy';
    if (stepId === 'content' || stepId === 'review') return 'website_overview';
  }

  return null;
}

export function countRequestedPolicyKinds(latestUserText: string) {
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

export function hasExplicitDeferralConstraint(latestUserText: string) {
  const normalized = normalizeFastPathText(latestUserText);
  if (!normalized.trim()) return false;
  if (
    !normalized.includes('diferimiento') &&
    !normalized.includes('diferimientos') &&
    !normalized.includes('diferir') &&
    !normalized.includes('deferral') &&
    !normalized.includes('deferrals')
  ) {
    return false;
  }

  return (
    /\bsolo\b|\bonly\b/.test(normalized) ||
    /\blesion\b|\binjury\b/.test(normalized) ||
    /\bcomprobante\b|\bmedical\b|\bproof\b/.test(normalized) ||
    /\b\d{1,3}\s+dias?\s+antes\s+del?\s+evento\b|\b\d{1,3}\s+days?\s+before\s+the\s+event\b/.test(
      normalized,
    ) ||
    /\bsin\s+diferimientos?\b|\bno\s+hay\s+diferimientos?\b|\bwithout\s+deferrals?\b|\bno\s+deferrals?\b/.test(
      normalized,
    )
  );
}

export function shouldForceBasicsFollowUpProposal(
  stepId: EventAiWizardPlanningStepId,
  latestUserText: string,
  locationIntentQuery: string | null,
) {
  if (stepId !== 'basics') return false;

  const normalized = normalizeFastPathText(latestUserText);
  if (!normalized.trim()) return false;

  const hasDateCue =
    /\b\d{1,2}\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+\d{4}\b/.test(
      normalized,
    ) ||
    /\b\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/.test(
      normalized,
    ) ||
    normalized.includes('fecha:');
  const hasTimeCue =
    normalized.includes('hora de inicio') ||
    normalized.includes('hora de fin') ||
    /\b(empezamos|empezar|empieza|empezara|iniciamos|inicia|iniciar|terminamos|termina|terminar)\b/.test(
      normalized,
    ) ||
    /\b\d{1,2}(?::\d{2})?\s?(am|pm)\b/.test(normalized);

  if (
    locationIntentQuery &&
    hasTimeCue &&
    (hasDateCue || /\b\d{1,2}:\d{2}\b/.test(normalized) || normalized.includes(' a las '))
  ) {
    return false;
  }

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

  return Boolean(locationIntentQuery || (hasActionVerb && (mentionsDistance || mentionsPricing)));
}

export function resolvePreferredFastPathKind(
  stepId: EventAiWizardPlanningStepId,
  latestUserText: string,
  crossStepIntent: EventAiWizardCrossStepIntent | null,
  previousFastPathKind: EventAiWizardFastPathKind | null,
): EventAiWizardFastPathKind | null {
  if (stepId === 'policies' && countRequestedPolicyKinds(latestUserText) > 1) {
    return null;
  }

  if (
    previousFastPathKind === 'content_bundle' &&
    isGenericContentRefinementRequest(stepId, latestUserText)
  ) {
    return 'content_bundle';
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

export function buildFastPathStructure(
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

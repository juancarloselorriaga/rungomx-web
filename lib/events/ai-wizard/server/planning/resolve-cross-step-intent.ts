import type { EventAiWizardCrossStepIntent } from '@/lib/events/ai-wizard/schemas';
import { eventAiWizardCrossStepIntentSchema } from '@/lib/events/ai-wizard/schemas';
import type { EventAiWizardPlanningStepId } from './types';

function normalizeFastPathText(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function resolveCrossStepIntent(
  stepId: EventAiWizardPlanningStepId,
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

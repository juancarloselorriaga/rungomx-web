import type { EventEditionDetail } from '@/lib/events/queries';
import type { SupportedLocale } from '@/lib/events/ai-wizard/server/planning/types';
import { buildEventWizardAggregate } from '@/lib/events/wizard/orchestrator';
import {
  mapWizardIssueStepToSetupStep,
  type EventSetupWizardStepId,
} from '@/lib/events/wizard/steps';

type WizardAggregate = ReturnType<typeof buildEventWizardAggregate>;

export function normalizeWizardLocale(locale: string | null | undefined): SupportedLocale {
  return locale?.toLowerCase().startsWith('en') ? 'en' : 'es';
}

export function getDiagnosisNextStep(stepId: EventSetupWizardStepId, aggregate: WizardAggregate) {
  return (
    aggregate.prioritizedChecklist
      .map((issue) => ({
        ...issue,
        stepId: mapWizardIssueStepToSetupStep(issue.stepId),
      }))
      .find((issue) => issue.stepId !== stepId) ?? null
  );
}

function getLocalizedWizardStepLabel(
  stepId: EventSetupWizardStepId,
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

function getLocalizedIssueText(issue: { code: string }, locale: SupportedLocale): string {
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
      RECOMMEND_WAIVERS:
        'Sería recomendable agregar una exención para que los participantes acepten términos.',
      RECOMMEND_QUESTIONS:
        'Sería recomendable agregar preguntas de registro para logística y preferencias.',
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
      RECOMMEND_WAIVERS:
        'It would help to add a waiver so participants can accept the event terms.',
      RECOMMEND_QUESTIONS:
        'It would help to add registration questions for logistics and preferences.',
      RECOMMEND_FAQ: 'It would help to add FAQs for the most common participant questions.',
      RECOMMEND_WEBSITE: 'It would help to complete the event website content.',
      RECOMMEND_ADD_ONS: 'It would help to configure add-ons if you plan to offer extras.',
      RECOMMEND_POLICIES: 'It would help to make participant-facing policies clearer.',
    },
  } as const;

  return map[locale][issue.code as keyof (typeof map)[typeof locale]] ?? issue.code;
}

export function buildStepDiagnosisText(args: {
  event: EventEditionDetail;
  aggregate: WizardAggregate;
  stepId: Exclude<EventSetupWizardStepId, 'distances' | 'registration' | 'extras'>;
  locale: SupportedLocale;
  diagnosisNextStep: { stepId: EventSetupWizardStepId } | null;
  hasWebsiteContent: boolean;
}): string {
  const { event, aggregate, stepId, locale, diagnosisNextStep, hasWebsiteContent } = args;
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

    lines.push(
      !hasPolicyCopy && !hasWaivers
        ? locale === 'es'
          ? 'En este paso todavía conviene definir al menos una política clara para participantes.'
          : 'It would still help to define at least one clear participant-facing policy in this step.'
        : locale === 'es'
          ? 'En Políticas no hay nada que bloquee el flujo por ahora, aunque todavía se puede reforzar la claridad antes de publicar.'
          : 'Nothing in Policies blocks the flow right now, although clarity can still be improved before publishing.',
    );

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
    const hasReviewRecommendations = optionalRecommendations.length > 0;

    lines.push(
      locale === 'es'
        ? 'Qué ya tiene Revisión y publicación ahora'
        : 'What Review & publish already has',
      publishBlockers.length === 0
        ? locale === 'es'
          ? 'Ya no quedan bloqueos obligatorios de publicación.'
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
          ? hasReviewRecommendations
            ? 'No hay bloqueos obligatorios de publicación, pero todavía conviene revisar estos puntos antes de publicar con más confianza.'
            : 'No hay bloqueos obligatorios de publicación ni mejoras recomendadas pendientes.'
          : hasReviewRecommendations
            ? 'There are no required publication blockers, but these points are still worth reviewing before publishing with more confidence.'
            : 'There are no required publication blockers or recommended improvements pending.',
      );
    } else {
      lines.push(...publishBlockers.map((issue) => `- ${getLocalizedIssueText(issue, locale)}`));
    }

    if (optionalRecommendations.length > 0) {
      lines.push(
        ...optionalRecommendations.map((issue) => `- ${getLocalizedIssueText(issue, locale)}`),
      );
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
          ? hasReviewRecommendations
            ? 'Puedes revisar estos últimos detalles o abrir los controles de visibilidad cuando lo decidas.'
            : 'Puedes revisar la visibilidad y publicar cuando quieras.'
          : hasReviewRecommendations
            ? 'You can review these last details or open the visibility controls whenever you decide.'
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

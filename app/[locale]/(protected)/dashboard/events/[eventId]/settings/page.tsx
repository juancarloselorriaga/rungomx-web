import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { type EventVisibility } from '@/lib/events/constants';
import { getEventEditionDetail } from '@/lib/events/queries';
import { getAddOnsForEdition } from '@/lib/events/add-ons/queries';
import { getPricingScheduleForEdition } from '@/lib/events/pricing/queries';
import { getQuestionsForEdition } from '@/lib/events/questions/queries';
import { buildEventWizardAggregate, type EventWizardStepId } from '@/lib/events/wizard/orchestrator';
import { hasWebsiteContent } from '@/lib/events/website/queries';
import { canUserAccessSeries } from '@/lib/organizations/permissions';
import { hasOrgPermission } from '@/lib/organizations/permissions';
import { guardProFeaturePage } from '@/lib/pro-features/server/guard';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AddOnsManager } from '../add-ons/add-ons-manager';
import { FaqManager } from '../faq/faq-manager';
import { PoliciesForm } from '../policies/policies-form';
import { PricingTiersManager } from '../pricing/pricing-tiers-manager';
import { QuestionsManager } from '../questions/questions-manager';
import { WaiverManager } from '../waivers/waiver-manager';
import { WebsiteContentEditor } from '../website/website-content-editor';

import {
  EventAiWizardPanel,
  type EventAiAssistantStepId,
} from './event-ai-wizard-panel';
import { EventAssistantDesktopWorkspace } from './event-assistant-desktop-workspace';
import { EventAssistantMobileWorkspace } from './event-assistant-mobile-workspace';
import { EventSettingsForm } from './event-settings-form';
import {
  EventSetupWizardShell,
  type EventSetupWizardStep,
  type EventSetupWizardStepId,
} from './event-setup-wizard-shell';
import { buildEventSettingsMetadata } from './settings-metadata';
import type { AppLocale } from '@/i18n/routing';

type SettingsPageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type WizardReviewIssue = {
  id: string;
  label: string;
  severity: 'required' | 'blocker' | 'optional';
  stepId: EventSetupWizardStepId;
  kind: 'publish' | 'required' | 'optional';
};

const STEP_ASSISTANT_CONFIG: Record<
  Exclude<EventAiAssistantStepId, 'registration' | 'extras'>,
  { suggestions: string[]; markdownFocus?: boolean }
> = {
  basics: {
    suggestions: [
      'draftFromBrief',
      'reviewMostImportantMissingDetails',
    ],
  },
  distances: {
    suggestions: [
      'createDistanceLineup',
      'reviewMissingDistances',
    ],
  },
  pricing: {
    suggestions: [
      'draftPricingStructure',
      'fixNextPricingBlocker',
    ],
  },
  policies: {
    suggestions: [
      'draftPolicyMarkdown',
      'improvePolicyClarity',
    ],
    markdownFocus: true,
  },
  content: {
    suggestions: [
      'draftParticipantContent',
      'improveContentClarity',
    ],
    markdownFocus: true,
  },
  review: {
    suggestions: [
      'explainCurrentBlockers',
      'improveParticipantCopyBeforePublish',
    ],
    markdownFocus: true,
  },
};

function mapIssueStepId(stepId: EventWizardStepId): EventSetupWizardStepId {
  switch (stepId) {
    case 'event_details':
      return 'basics';
    case 'distances':
      return 'distances';
    case 'pricing':
      return 'pricing';
    case 'waivers':
    case 'policies':
      return 'policies';
    case 'faq':
    case 'website':
      return 'content';
    case 'questions':
    case 'add_ons':
      return 'extras';
    case 'publish':
      return 'review';
    default:
      return 'basics';
  }
}

function StepSurface({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function StepGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function StepWithAssistant({
  assistant,
  assistantMode = 'workspace',
  mobileTriggerLabel,
  mobileTriggerHint,
  desktopTriggerLabel,
  desktopTriggerHint,
  desktopWorkspaceTitle,
  desktopWorkspaceDescription,
  children,
}: {
  assistant?: ReactNode;
  assistantMode?: 'workspace' | 'inline';
  mobileTriggerLabel: string;
  mobileTriggerHint: string;
  desktopTriggerLabel: string;
  desktopTriggerHint: string;
  desktopWorkspaceTitle: string;
  desktopWorkspaceDescription: string;
  children: ReactNode;
}) {
  if (!assistant) {
    return <>{children}</>;
  }

  if (assistantMode === 'inline') {
    return (
      <div className="space-y-6">
        <div className="lg:hidden">
          <EventAssistantMobileWorkspace
            triggerLabel={mobileTriggerLabel}
            triggerHint={mobileTriggerHint}
          >
            {assistant}
          </EventAssistantMobileWorkspace>
        </div>
        <div className="min-w-0">{children}</div>
        <div className="hidden max-w-3xl lg:block">{assistant}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="lg:hidden">
        <EventAssistantMobileWorkspace
          triggerLabel={mobileTriggerLabel}
          triggerHint={mobileTriggerHint}
        >
          {assistant}
        </EventAssistantMobileWorkspace>
      </div>
      <div className="hidden lg:block">
        <EventAssistantDesktopWorkspace
          triggerLabel={desktopTriggerLabel}
          triggerHint={desktopTriggerHint}
          workspaceTitle={desktopWorkspaceTitle}
          workspaceDescription={desktopWorkspaceDescription}
        >
          {assistant}
        </EventAssistantDesktopWorkspace>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function resolveInitialWizardStepId(value: string | string[] | undefined): EventSetupWizardStepId | undefined {
  const stepId = Array.isArray(value) ? value[0] : value;
  if (!stepId) return undefined;

  switch (stepId) {
    case 'basics':
    case 'distances':
    case 'pricing':
    case 'registration':
    case 'policies':
    case 'content':
    case 'extras':
    case 'review':
      return stepId;
    default:
      return undefined;
  }
}

export async function generateMetadata({ params }: SettingsPageProps): Promise<Metadata> {
  const { locale, eventId } = await params;
  const event = await getEventEditionDetail(eventId);
  return buildEventSettingsMetadata(locale as AppLocale, event);
}

export default async function EventSettingsPage({ params, searchParams }: SettingsPageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/settings' });
  await connection();
  const t = await getTranslations('pages.dashboardEventSettings');
  const tVis = await getTranslations('pages.dashboardEvents.visibility');
  const tPricing = await getTranslations('pages.dashboardEvents.pricing');
  const tFaq = await getTranslations('pages.dashboardEvents.faq');
  const tWaivers = await getTranslations('pages.dashboardEvents.waivers');
  const tPolicies = await getTranslations('pages.dashboardEvents.policies');
  const tQuestions = await getTranslations('pages.dashboardEvents.questions');
  const tAddOns = await getTranslations('pages.dashboardEvents.addOns');
  const tWebsite = await getTranslations('pages.dashboardEventWebsite');
  const authContext = await getAuthContext();
  const resolvedSearchParams = await searchParams;
  const wizardMode = resolvedSearchParams?.wizard === '1';
  const initialWizardStepId = resolveInitialWizardStepId(resolvedSearchParams?.step);

  const canAccessEvents =
    authContext.permissions.canViewOrganizersDashboard ||
    authContext.permissions.canManageEvents;
  if (!canAccessEvents) {
    redirect(getPathname({ href: '/dashboard', locale }));
  }

  const event = await getEventEditionDetail(eventId);
  if (!event) {
    notFound();
  }

  const canAccess = await canUserAccessSeries(authContext.user!.id, event.seriesId);
  if (!canAccess) {
    redirect(getPathname({ href: '/dashboard/events', locale }));
  }

  const exitWizardHref = {
    pathname: '/dashboard/events/[eventId]/settings',
    params: { eventId },
  } as const;

  if (wizardMode) {
    const assistantGate = await guardProFeaturePage('event_ai_wizard', authContext);
    const [pricingData, questions, addOns, websiteEnabled] = await Promise.all([
      getPricingScheduleForEdition(eventId),
      getQuestionsForEdition(eventId),
      getAddOnsForEdition(eventId),
      hasWebsiteContent(eventId),
    ]);

    const aggregate = buildEventWizardAggregate(event, {
      selectedPath: 'manual',
      hasWebsiteContent: websiteEnabled,
      questionCount: questions.length,
      addOnCount: addOns.length,
      capabilityLocks: {
        canUseAiAssistant:
          assistantGate.allowed &&
          hasOrgPermission(canAccess.role, 'canEditEventConfig') &&
          hasOrgPermission(canAccess.role, 'canEditRegistrationSettings'),
        canApplyAiPatch:
          assistantGate.allowed &&
          hasOrgPermission(canAccess.role, 'canEditEventConfig') &&
          hasOrgPermission(canAccess.role, 'canEditRegistrationSettings'),
      },
    });

    const reviewBlockers: WizardReviewIssue[] = [...aggregate.publishBlockers, ...aggregate.missingRequired]
      .filter((issue, index, list) => list.findIndex((candidate) => candidate.code === issue.code) === index)
      .map((issue) => ({
        id: issue.id,
        label: t(issue.labelKey),
        severity: issue.severity,
        stepId: mapIssueStepId(issue.stepId),
        kind: issue.severity === 'blocker' ? 'publish' : 'required',
      }));

    const reviewRecommendations: WizardReviewIssue[] = aggregate.optionalRecommendations.map((issue) => ({
      id: issue.id,
      label: t(issue.labelKey),
      severity: issue.severity,
      stepId: mapIssueStepId(issue.stepId),
      kind: 'optional',
    }));

    const distances = event.distances.map((distance) => ({
      id: distance.id,
      label: distance.label,
      distanceValue: distance.distanceValue,
      distanceUnit: distance.distanceUnit,
    }));
    const assistantCanEdit =
      assistantGate.allowed &&
      hasOrgPermission(canAccess.role, 'canEditEventConfig') &&
      hasOrgPermission(canAccess.role, 'canEditRegistrationSettings');
    const assistantLayoutMode = assistantCanEdit ? 'workspace' : 'inline';

    function renderAssistant(stepId: Exclude<EventAiAssistantStepId, 'registration' | 'extras'>) {
      if (!assistantGate.allowed) {
        return <div className="rounded-[28px] border border-border/70 bg-background/80 p-2">{assistantGate.disabled ?? assistantGate.upsell}</div>;
      }
      if (!assistantCanEdit) {
        return (
          <div className="rounded-[28px] border border-border/70 bg-background/90 p-5">
            <p className="text-sm font-semibold text-foreground">{t('assistant.errors.readOnlyTitle')}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('assistant.errors.readOnlyDescription')}</p>
          </div>
        );
      }

      const config = STEP_ASSISTANT_CONFIG[stepId];
      return (
        <EventAiWizardPanel
          editionId={eventId}
          stepId={stepId}
          stepTitle={t(`wizardShell.steps.${stepId}`)}
          suggestions={config.suggestions.map((suggestionKey) =>
            t(`assistant.suggestions.${stepId}.${suggestionKey}` as never),
          )}
          markdownFocus={config.markdownFocus}
          initialEventBrief={event?.organizerBrief ?? null}
          embeddedInWorkspace={assistantLayoutMode === 'workspace'}
        />
      );
    }

    const stepBodies: EventSetupWizardStep[] = [
      {
        id: 'basics',
        required: true,
        completed: aggregate.setupStepStateById.basics.completed,
        content: (
          <StepSurface title={t('wizardShell.steps.basics')} description={t('wizardShell.stepDescriptions.basics')}>
            <StepWithAssistant
              assistant={renderAssistant('basics')}
              assistantMode={assistantLayoutMode}
              mobileTriggerLabel={t('assistant.mobile.open')}
              mobileTriggerHint={t('assistant.mobile.stepHint', {
                step: t('wizardShell.steps.basics'),
              })}
              desktopTriggerLabel={t('assistant.desktop.open')}
              desktopTriggerHint={t('assistant.desktop.stepHint', {
                step: t('wizardShell.steps.basics'),
              })}
              desktopWorkspaceTitle={t('assistant.desktop.workspaceTitle', {
                step: t('wizardShell.steps.basics'),
              })}
              desktopWorkspaceDescription={t('assistant.desktop.workspaceDescription', {
                step: t('wizardShell.steps.basics'),
              })}
            >
              <EventSettingsForm event={event} surface="wizard-basics" />
            </StepWithAssistant>
          </StepSurface>
        ),
      },
      {
        id: 'distances',
        required: true,
        completed: aggregate.setupStepStateById.distances.completed,
        content: (
          <StepSurface
            title={t('wizardShell.steps.distances')}
            description={t('wizardShell.stepDescriptions.distances')}
          >
            <StepWithAssistant
              assistant={renderAssistant('distances')}
              assistantMode={assistantLayoutMode}
              mobileTriggerLabel={t('assistant.mobile.open')}
              mobileTriggerHint={t('assistant.mobile.stepHint', {
                step: t('wizardShell.steps.distances'),
              })}
              desktopTriggerLabel={t('assistant.desktop.open')}
              desktopTriggerHint={t('assistant.desktop.stepHint', {
                step: t('wizardShell.steps.distances'),
              })}
              desktopWorkspaceTitle={t('assistant.desktop.workspaceTitle', {
                step: t('wizardShell.steps.distances'),
              })}
              desktopWorkspaceDescription={t('assistant.desktop.workspaceDescription', {
                step: t('wizardShell.steps.distances'),
              })}
            >
              <EventSettingsForm event={event} surface="wizard-distances" />
            </StepWithAssistant>
          </StepSurface>
        ),
      },
      {
        id: 'pricing',
        required: true,
        completed: aggregate.setupStepStateById.pricing.completed,
        content: (
          <StepSurface title={tPricing('title')} description={tPricing('description')}>
            <StepWithAssistant
              assistant={renderAssistant('pricing')}
              assistantMode={assistantLayoutMode}
              mobileTriggerLabel={t('assistant.mobile.open')}
              mobileTriggerHint={t('assistant.mobile.stepHint', {
                step: t('wizardShell.steps.pricing'),
              })}
              desktopTriggerLabel={t('assistant.desktop.open')}
              desktopTriggerHint={t('assistant.desktop.stepHint', {
                step: t('wizardShell.steps.pricing'),
              })}
              desktopWorkspaceTitle={t('assistant.desktop.workspaceTitle', {
                step: t('wizardShell.steps.pricing'),
              })}
              desktopWorkspaceDescription={t('assistant.desktop.workspaceDescription', {
                step: t('wizardShell.steps.pricing'),
              })}
            >
              <div className="max-w-5xl">
                <PricingTiersManager distances={distances} initialPricingData={pricingData} />
              </div>
            </StepWithAssistant>
          </StepSurface>
        ),
      },
      {
        id: 'registration',
        required: false,
        completed: aggregate.setupStepStateById.registration.completed,
        content: (
          <StepSurface
            title={t('wizardShell.steps.registration')}
            description={t('wizardShell.stepDescriptions.registration')}
          >
            <EventSettingsForm event={event} surface="wizard-registration" />
          </StepSurface>
        ),
      },
      {
        id: 'policies',
        required: false,
        completed: aggregate.setupStepStateById.policies.completed,
        content: (
          <StepSurface
            title={t('wizardShell.steps.policies')}
            description={t('wizardShell.stepDescriptions.policies')}
          >
            <StepWithAssistant
              assistant={renderAssistant('policies')}
              assistantMode={assistantLayoutMode}
              mobileTriggerLabel={t('assistant.mobile.open')}
              mobileTriggerHint={t('assistant.mobile.stepHint', {
                step: t('wizardShell.steps.policies'),
              })}
              desktopTriggerLabel={t('assistant.desktop.open')}
              desktopTriggerHint={t('assistant.desktop.stepHint', {
                step: t('wizardShell.steps.policies'),
              })}
              desktopWorkspaceTitle={t('assistant.desktop.workspaceTitle', {
                step: t('wizardShell.steps.policies'),
              })}
              desktopWorkspaceDescription={t('assistant.desktop.workspaceDescription', {
                step: t('wizardShell.steps.policies'),
              })}
            >
              <div className="space-y-8">
                <StepGroup title={tPolicies('title')} description={tPolicies('description')}>
                  <div className="max-w-5xl">
                    <PoliciesForm eventId={eventId} initialPolicies={event.policyConfig} />
                  </div>
                </StepGroup>
                <StepGroup title={tWaivers('title')} description={tWaivers('description')}>
                  <div className="max-w-5xl">
                    <WaiverManager eventId={eventId} initialWaivers={event.waivers} />
                  </div>
                </StepGroup>
              </div>
            </StepWithAssistant>
          </StepSurface>
        ),
      },
      {
        id: 'content',
        required: false,
        completed: aggregate.setupStepStateById.content.completed,
        content: (
          <StepSurface
            title={t('wizardShell.steps.content')}
            description={t('wizardShell.stepDescriptions.content')}
          >
            <StepWithAssistant
              assistant={renderAssistant('content')}
              assistantMode={assistantLayoutMode}
              mobileTriggerLabel={t('assistant.mobile.open')}
              mobileTriggerHint={t('assistant.mobile.stepHint', {
                step: t('wizardShell.steps.content'),
              })}
              desktopTriggerLabel={t('assistant.desktop.open')}
              desktopTriggerHint={t('assistant.desktop.stepHint', {
                step: t('wizardShell.steps.content'),
              })}
              desktopWorkspaceTitle={t('assistant.desktop.workspaceTitle', {
                step: t('wizardShell.steps.content'),
              })}
              desktopWorkspaceDescription={t('assistant.desktop.workspaceDescription', {
                step: t('wizardShell.steps.content'),
              })}
            >
              <div className="space-y-8">
                <StepGroup title={tFaq('title')} description={tFaq('description')}>
                  <div className="max-w-5xl">
                    <FaqManager eventId={eventId} initialFaqItems={event.faqItems} />
                  </div>
                </StepGroup>
                <StepGroup title={tWebsite('title')} description={tWebsite('description')}>
                  <WebsiteContentEditor
                    editionId={eventId}
                    locale={locale}
                    organizationId={event.organizationId}
                  />
                </StepGroup>
              </div>
            </StepWithAssistant>
          </StepSurface>
        ),
      },
      {
        id: 'extras',
        required: false,
        completed: aggregate.setupStepStateById.extras.completed,
        content: (
          <StepSurface
            title={t('wizardShell.steps.extras')}
            description={t('wizardShell.stepDescriptions.extras')}
          >
            <div className="space-y-8">
              <StepGroup title={tQuestions('title')} description={tQuestions('description')}>
                <div className="max-w-4xl">
                  <QuestionsManager editionId={eventId} distances={event.distances} initialQuestions={questions} />
                </div>
              </StepGroup>
              <StepGroup title={tAddOns('title')} description={tAddOns('description')}>
                <div className="max-w-4xl">
                  <AddOnsManager editionId={eventId} distances={distances} initialAddOns={addOns} />
                </div>
              </StepGroup>
            </div>
          </StepSurface>
        ),
      },
      {
        id: 'review',
        required: true,
        completed: aggregate.setupStepStateById.review.completed,
        content: null,
      },
    ];

    const wizardShellStateKey = [
      initialWizardStepId ?? 'default',
      ...stepBodies.map((step) => `${step.id}:${step.completed ? '1' : '0'}:${step.required ? '1' : '0'}`),
      reviewBlockers.map((issue) => `${issue.id}:${issue.stepId}:${issue.kind}`).join(','),
    ].join('|');

    return (
      <EventSetupWizardShell
        key={wizardShellStateKey}
        eventId={event.id}
        eventName={`${event.seriesName} ${event.editionLabel}`}
        organizationName={event.organizationName}
        statusLabel={tVis(event.visibility as EventVisibility)}
        exitHref={exitWizardHref}
        steps={stepBodies}
        initialStepId={initialWizardStepId}
        reviewBlockers={reviewBlockers}
        reviewRecommendations={reviewRecommendations}
        reviewControls={
          <StepSurface
            title={t('wizardShell.steps.review')}
            description={t('wizardShell.stepDescriptions.review')}
          >
            <StepWithAssistant
              assistant={renderAssistant('review')}
              assistantMode="inline"
              mobileTriggerLabel={t('assistant.mobile.open')}
              mobileTriggerHint={t('assistant.mobile.stepHint', {
                step: t('wizardShell.steps.review'),
              })}
              desktopTriggerLabel={t('assistant.desktop.open')}
              desktopTriggerHint={t('assistant.desktop.stepHint', {
                step: t('wizardShell.steps.review'),
              })}
              desktopWorkspaceTitle={t('assistant.desktop.workspaceTitle', {
                step: t('wizardShell.steps.review'),
              })}
              desktopWorkspaceDescription={t('assistant.desktop.workspaceDescription', {
                step: t('wizardShell.steps.review'),
              })}
            >
              <EventSettingsForm event={event} surface="wizard-review" />
            </StepWithAssistant>
          </StepSurface>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="mb-2 text-2xl font-semibold tracking-tight">{t('title')}</h2>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
      </div>

      <div className="max-w-4xl">
        <EventSettingsForm event={event} />
      </div>
    </div>
  );
}

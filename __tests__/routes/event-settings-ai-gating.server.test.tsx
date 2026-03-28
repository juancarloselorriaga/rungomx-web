import { renderToStaticMarkup } from 'react-dom/server';

import EventSettingsPage from '@/app/[locale]/(protected)/dashboard/events/[eventId]/settings/page';
import { getAuthContext } from '@/lib/auth/server';
import { getAddOnsForEdition } from '@/lib/events/add-ons/queries';
import { getPricingScheduleForEdition } from '@/lib/events/pricing/queries';
import { getQuestionsForEdition } from '@/lib/events/questions/queries';
import { getEventEditionDetail } from '@/lib/events/queries';
import {
  buildEventWizardAggregate,
  hasEventPublishReadinessBlockers,
} from '@/lib/events/wizard/orchestrator';
import {
  getPublicWebsiteContent,
  getWebsiteContentsForEdition,
} from '@/lib/events/website/queries';
import { canUserAccessSeries } from '@/lib/organizations/permissions';
import { guardProFeaturePage } from '@/lib/pro-features/server/guard';

jest.mock('@/lib/auth/server', () => ({
  getAuthContext: jest.fn(),
}));

jest.mock('@/lib/events/queries', () => ({
  getEventEditionDetail: jest.fn(),
}));

jest.mock('@/lib/events/add-ons/queries', () => ({
  getAddOnsForEdition: jest.fn(),
}));

jest.mock('@/lib/events/pricing/queries', () => ({
  getPricingScheduleForEdition: jest.fn(),
}));

jest.mock('@/lib/events/questions/queries', () => ({
  getQuestionsForEdition: jest.fn(),
}));

jest.mock('@/lib/events/wizard/orchestrator', () => ({
  buildEventWizardAggregate: jest.fn(),
  hasEventPublishReadinessBlockers: jest.fn(),
}));

jest.mock('@/lib/events/website/queries', () => ({
  getPublicWebsiteContent: jest.fn(),
  getWebsiteContentsForEdition: jest.fn(),
}));

jest.mock('@/lib/organizations/permissions', () => ({
  canUserAccessSeries: jest.fn(),
  hasOrgPermission: jest.fn(() => true),
}));

jest.mock('@/lib/pro-features/server/guard', () => ({
  guardProFeaturePage: jest.fn(),
}));

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(async () => undefined),
}));

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(async () => (key: string) => key),
}));

jest.mock('next/server', () => ({
  connection: jest.fn(async () => undefined),
}));

jest.mock('@/i18n/navigation', () => ({
  getPathname: jest.fn(({ href, locale }: { href: string; locale: string }) =>
    typeof href === 'string' ? `/${locale}${href}` : `/${locale}/dashboard/events`,
  ),
}));

jest.mock(
  '@/app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-ai-wizard-panel',
  () => ({
    EventAiWizardPanel: () => <div data-testid="assistant-panel">assistant-panel</div>,
  }),
);

jest.mock(
  '@/app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-assistant-responsive-slot',
  () => ({
    EventAssistantResponsiveSlot: ({
      assistant,
      children,
    }: {
      assistant?: React.ReactNode;
      children: React.ReactNode;
    }) => (
      <div>
        {assistant ? <div data-testid="assistant-slot">{assistant}</div> : null}
        <div>{children}</div>
      </div>
    ),
  }),
);

const mockEventSettingsForm: jest.Mock<React.JSX.Element, [unknown]> = jest.fn((...args) => {
  void args;
  return <div data-testid="settings-form">settings-form</div>;
});

jest.mock(
  '@/app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-settings-form',
  () => ({
    EventSettingsForm: (props: unknown) => mockEventSettingsForm(props),
  }),
);

jest.mock(
  '@/app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-setup-wizard-shell',
  () => ({
    EventSetupWizardShell: ({
      steps,
      reviewControls,
    }: {
      steps: Array<{ id: string; content: React.ReactNode }>;
      reviewControls: React.ReactNode;
    }) => (
      <div data-testid="wizard-shell">
        {steps.map((step) => (
          <section key={step.id} data-step-id={step.id}>
            {step.content}
          </section>
        ))}
        <section data-step-id="review-controls">{reviewControls}</section>
      </div>
    ),
  }),
);

jest.mock('@/app/[locale]/(protected)/dashboard/events/[eventId]/add-ons/add-ons-manager', () => ({
  AddOnsManager: () => <div>add-ons</div>,
}));

jest.mock('@/app/[locale]/(protected)/dashboard/events/[eventId]/faq/faq-manager', () => ({
  FaqManager: () => <div>faq</div>,
}));

jest.mock('@/app/[locale]/(protected)/dashboard/events/[eventId]/policies/policies-form', () => ({
  PoliciesForm: () => <div>policies</div>,
}));

jest.mock(
  '@/app/[locale]/(protected)/dashboard/events/[eventId]/pricing/pricing-tiers-manager',
  () => ({
    PricingTiersManager: () => <div>pricing</div>,
  }),
);

jest.mock(
  '@/app/[locale]/(protected)/dashboard/events/[eventId]/questions/questions-manager',
  () => ({
    QuestionsManager: () => <div>questions</div>,
  }),
);

jest.mock('@/app/[locale]/(protected)/dashboard/events/[eventId]/waivers/waiver-manager', () => ({
  WaiverManager: () => <div>waivers</div>,
}));

jest.mock(
  '@/app/[locale]/(protected)/dashboard/events/[eventId]/website/website-content-editor',
  () => ({
    WebsiteContentEditor: () => <div>website</div>,
  }),
);

const mockGetAuthContext = getAuthContext as jest.MockedFunction<typeof getAuthContext>;
const mockGetEventEditionDetail = getEventEditionDetail as jest.MockedFunction<
  typeof getEventEditionDetail
>;
const mockGetAddOnsForEdition = getAddOnsForEdition as jest.MockedFunction<
  typeof getAddOnsForEdition
>;
const mockGetPricingScheduleForEdition = getPricingScheduleForEdition as jest.MockedFunction<
  typeof getPricingScheduleForEdition
>;
const mockGetQuestionsForEdition = getQuestionsForEdition as jest.MockedFunction<
  typeof getQuestionsForEdition
>;
const mockBuildEventWizardAggregate = buildEventWizardAggregate as jest.MockedFunction<
  typeof buildEventWizardAggregate
>;
const mockHasEventPublishReadinessBlockers =
  hasEventPublishReadinessBlockers as jest.MockedFunction<typeof hasEventPublishReadinessBlockers>;
const mockGetPublicWebsiteContent = getPublicWebsiteContent as jest.MockedFunction<
  typeof getPublicWebsiteContent
>;
const mockGetWebsiteContentsForEdition = getWebsiteContentsForEdition as jest.MockedFunction<
  typeof getWebsiteContentsForEdition
>;
const mockCanUserAccessSeries = canUserAccessSeries as jest.MockedFunction<
  typeof canUserAccessSeries
>;
const mockGuardProFeaturePage = guardProFeaturePage as jest.MockedFunction<
  typeof guardProFeaturePage
>;

describe('EventSettingsPage AI gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEventSettingsForm.mockClear();
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: {
        canViewOrganizersDashboard: true,
        canManageEvents: false,
      },
    } as Awaited<ReturnType<typeof getAuthContext>>);
    mockGetEventEditionDetail.mockResolvedValue({
      id: 'edition-1',
      publicCode: 'EVT1',
      slug: 'event-1',
      editionLabel: '2026',
      visibility: 'draft',
      description: 'Event description',
      organizerBrief: 'Hidden when AI is off',
      startsAt: null,
      endsAt: null,
      timezone: 'America/Mexico_City',
      registrationOpensAt: null,
      registrationClosesAt: null,
      isRegistrationPaused: false,
      sharedCapacity: null,
      locationDisplay: null,
      address: null,
      city: 'Guadalajara',
      state: 'Jalisco',
      country: 'MX',
      latitude: null,
      longitude: null,
      externalUrl: null,
      heroImageMediaId: null,
      heroImageUrl: null,
      seriesId: 'series-1',
      seriesName: 'Trail Series',
      seriesSlug: 'trail-series',
      sportType: 'trail_running',
      organizationId: 'org-1',
      organizationName: 'Org',
      organizationSlug: 'org',
      distances: [],
      faqItems: [],
      waivers: [],
      policyConfig: null,
    } as Awaited<ReturnType<typeof getEventEditionDetail>>);
    mockCanUserAccessSeries.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
    });
    mockGuardProFeaturePage.mockResolvedValue({
      allowed: false,
      decision: {
        featureKey: 'event_ai_wizard',
        status: 'disabled',
        reason: 'config_disabled',
        config: {
          featureKey: 'event_ai_wizard',
          enabled: false,
          visibilityOverride: null,
          notes: null,
          defaultVisibility: 'locked',
          enforcement: 'server_required',
          upsellHref: '/settings/billing',
        },
      },
      disabled: <div data-testid="disabled-banner">disabled-banner</div>,
    });
    mockGetPricingScheduleForEdition.mockResolvedValue([]);
    mockGetQuestionsForEdition.mockResolvedValue([]);
    mockGetAddOnsForEdition.mockResolvedValue([]);
    mockGetWebsiteContentsForEdition.mockResolvedValue([]);
    mockGetPublicWebsiteContent.mockResolvedValue(null);
    mockHasEventPublishReadinessBlockers.mockReturnValue(false);
    mockBuildEventWizardAggregate.mockReturnValue({
      setupStepStateById: {
        basics: { completed: false },
        distances: { completed: false },
        pricing: { completed: false },
        registration: { completed: false },
        policies: { completed: false },
        content: { completed: false },
        extras: { completed: false },
        review: { completed: false },
      },
      prioritizedChecklist: [],
      completionByStepId: {},
      progress: {
        completed: 0,
        total: 8,
        requiredCompleted: 0,
        requiredTotal: 4,
      },
      publishBlockers: [],
      missingRequired: [],
      optionalRecommendations: [],
    } as unknown as ReturnType<typeof buildEventWizardAggregate>);
  });

  it('renders the wizard shell without assistant traces when the feature is disabled', async () => {
    const html = renderToStaticMarkup(
      await EventSettingsPage({
        params: Promise.resolve({ locale: 'en' as const, eventId: 'edition-1' }),
        searchParams: Promise.resolve({ wizard: '1', step: 'basics' }),
      }),
    );

    expect(html).toContain('wizard-shell');
    expect(html).toContain('settings-form');
    expect(html).not.toContain('assistant-panel');
    expect(html).not.toContain('assistant-slot');
    expect(html).not.toContain('disabled-banner');
  });

  it('passes publish blocking state to the full settings form outside the wizard', async () => {
    mockBuildEventWizardAggregate.mockReturnValue({
      setupStepStateById: {
        basics: { completed: false },
        distances: { completed: false },
        pricing: { completed: false },
        registration: { completed: false },
        policies: { completed: false },
        content: { completed: false },
        extras: { completed: false },
        review: { completed: false },
      },
      prioritizedChecklist: [
        {
          id: '1',
          code: 'MISSING_EVENT_DATE',
          severity: 'required',
          labelKey: 'wizard.issues.missingEventDate',
          stepId: 'event_details',
        },
      ],
      completionByStepId: {},
      progress: {
        completed: 0,
        total: 8,
        requiredCompleted: 0,
        requiredTotal: 4,
      },
      publishBlockers: [],
      missingRequired: [
        {
          id: '1',
          code: 'MISSING_EVENT_DATE',
          severity: 'required',
          labelKey: 'wizard.issues.missingEventDate',
          stepId: 'event_details',
        },
      ],
      optionalRecommendations: [],
    } as unknown as ReturnType<typeof buildEventWizardAggregate>);
    mockHasEventPublishReadinessBlockers.mockReturnValue(true);

    renderToStaticMarkup(
      await EventSettingsPage({
        params: Promise.resolve({ locale: 'en' as const, eventId: 'edition-1' }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(mockEventSettingsForm).toHaveBeenCalledWith(
      expect.objectContaining({
        disablePublish: true,
        publishDisabledReasons: [
          {
            label: 'wizard.issues.missingEventDate',
            href: undefined,
          },
        ],
      }),
    );
  });

  it('passes the visible blocker labels to the wizard review publish controls', async () => {
    mockBuildEventWizardAggregate.mockReturnValue({
      setupStepStateById: {
        basics: { completed: false },
        distances: { completed: false },
        pricing: { completed: false },
        registration: { completed: false },
        policies: { completed: false },
        content: { completed: false },
        extras: { completed: false },
        review: { completed: false },
      },
      prioritizedChecklist: [
        {
          id: '1',
          code: 'MISSING_EVENT_DATE',
          severity: 'required',
          labelKey: 'wizard.issues.missingEventDate',
          stepId: 'event_details',
        },
        {
          id: '2',
          code: 'MISSING_DISTANCE',
          severity: 'blocker',
          labelKey: 'wizard.issues.publishMissingDistance',
          stepId: 'distances',
        },
      ],
      completionByStepId: {},
      progress: {
        completed: 0,
        total: 8,
        requiredCompleted: 0,
        requiredTotal: 4,
      },
      publishBlockers: [
        {
          id: '2',
          code: 'MISSING_DISTANCE',
          severity: 'blocker',
          labelKey: 'wizard.issues.publishMissingDistance',
          stepId: 'distances',
        },
      ],
      missingRequired: [
        {
          id: '1',
          code: 'MISSING_EVENT_DATE',
          severity: 'required',
          labelKey: 'wizard.issues.missingEventDate',
          stepId: 'event_details',
        },
      ],
      optionalRecommendations: [],
    } as unknown as ReturnType<typeof buildEventWizardAggregate>);
    mockHasEventPublishReadinessBlockers.mockReturnValue(true);

    renderToStaticMarkup(
      await EventSettingsPage({
        params: Promise.resolve({ locale: 'en' as const, eventId: 'edition-1' }),
        searchParams: Promise.resolve({ wizard: '1', step: 'review' }),
      }),
    );

    expect(mockEventSettingsForm).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: 'wizard-review',
        disablePublish: true,
        publishDisabledReasons: [
          {
            label: 'wizard.issues.publishMissingDistance',
            href: undefined,
          },
          {
            label: 'wizard.issues.missingEventDate',
            href: undefined,
          },
        ],
      }),
    );
  });
});

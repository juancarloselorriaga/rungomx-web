import { fireEvent, render, screen } from '@testing-library/react';

import {
  EventSetupWizardShell,
  type EventSetupWizardStep,
} from '@/app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-setup-wizard-shell';

const refreshMock = jest.fn();

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (values && 'current' in values && 'total' in values) {
      return `${key}:${values.current}/${values.total}`;
    }
    if (values && 'step' in values) {
      return `${key}:${values.step}`;
    }
    return key;
  },
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={typeof href === 'string' ? href : '#'} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

function buildSteps(overrides?: Partial<Record<EventSetupWizardStep['id'], Partial<EventSetupWizardStep>>>) {
  const baseSteps: EventSetupWizardStep[] = [
    { id: 'basics', required: true, completed: true, content: <div>basics-step-body</div> },
    { id: 'distances', required: true, completed: true, content: <div>distances-step-body</div> },
    { id: 'pricing', required: true, completed: true, content: <div>pricing-step-body</div> },
    { id: 'registration', required: false, completed: false, content: <div>registration-step-body</div> },
    { id: 'policies', required: false, completed: false, content: <div>policies-step-body</div> },
    { id: 'content', required: false, completed: false, content: <div>content-step-body</div> },
    { id: 'extras', required: false, completed: false, content: <div>extras-step-body</div> },
    { id: 'review', required: true, completed: false, content: null },
  ];

  return baseSteps.map((step) => ({ ...step, ...overrides?.[step.id] }));
}

function renderShell({
  steps = buildSteps(),
  initialStepId,
  reviewBlockers = [],
  reviewRecommendations = [],
  reviewPayloadToken = 'review-token-stale',
}: {
  steps?: EventSetupWizardStep[];
  initialStepId?: EventSetupWizardStep['id'];
  reviewBlockers?: Array<{
    id: string;
    label: string;
    stepId: EventSetupWizardStep['id'];
    severity: 'required' | 'blocker' | 'optional';
    kind: 'publish' | 'required' | 'optional';
  }>;
  reviewRecommendations?: Array<{
    id: string;
    label: string;
    stepId: EventSetupWizardStep['id'];
    severity: 'required' | 'blocker' | 'optional';
    kind: 'publish' | 'required' | 'optional';
  }>;
  reviewPayloadToken?: string;
}) {
  return render(
    <EventSetupWizardShell
      eventId="evt-1"
      eventName="TrailMX 2026"
      organizationName="TrailMX"
      statusLabel="Draft"
      exitHref={{ pathname: '/dashboard/events/[eventId]/settings', params: { eventId: 'evt-1' } }}
      steps={steps}
      reviewControls={<div>review-controls</div>}
      reviewBlockers={reviewBlockers}
      reviewRecommendations={reviewRecommendations}
      reviewPayloadToken={reviewPayloadToken}
      initialStepId={initialStepId}
    />,
  );
}

describe('EventSetupWizardShell', () => {
  let pushStateSpy: jest.SpyInstance;

  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    pushStateSpy = jest.spyOn(window.history, 'pushState');
    refreshMock.mockClear();
  });

  afterEach(() => {
    pushStateSpy.mockRestore();
  });

  it('renders the first mounted step body', () => {
    renderShell({});

    expect(screen.getByText('basics-step-body')).toBeInTheDocument();
    expect(screen.getByText('wizardShell.title')).toBeInTheDocument();
  });

  it('blocks next on an incomplete required step', () => {
    renderShell({ steps: buildSteps({ basics: { completed: false } }) });

    const nextButton = screen.getByRole('button', { name: /wizardShell.navigation.next/i });
    expect(nextButton).toBeDisabled();
    expect(screen.getByText(/wizardShell.footer.completeRequired/i)).toBeInTheDocument();
  });

  it('allows skipping an optional incomplete step', () => {
    renderShell({ steps: buildSteps(), initialStepId: 'registration' });

    expect(screen.getByText('registration-step-body')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /wizardShell.navigation.skip/i }));

    expect(screen.getByText('policies-step-body')).toBeInTheDocument();
    expect(screen.getByText('wizardShell.sidebar.skipped')).toBeInTheDocument();
    expect(window.location.search).toContain('step=policies');
  });

  it('reroutes a deep-linked optional step to the earliest incomplete required step', () => {
    renderShell({
      steps: buildSteps({ basics: { completed: false }, content: { completed: true } }),
      initialStepId: 'content',
    });

    expect(screen.getByText('basics-step-body')).toBeInTheDocument();
    expect(screen.queryByText('content-step-body')).not.toBeInTheDocument();
    expect(window.location.search).toContain('step=basics');
    expect(screen.getByText('wizardShell.footer.completeRequired:wizardShell.steps.basics')).toBeInTheDocument();
  });

  it('renders review content with controls on the review step', () => {
    renderShell({
      steps: buildSteps({ review: { completed: true } }),
      initialStepId: 'review',
    });

    expect(screen.getByText('review-controls')).toBeInTheDocument();
    expect(screen.getByText('wizardShell.review.readyTitle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /wizardShell.review.openPublishControls/i })).toBeInTheDocument();
  });

  it('holds review in a rechecking state instead of showing stale blockers when entering review', () => {
    renderShell({
      steps: buildSteps({ content: { completed: true } }),
      initialStepId: 'content',
      reviewBlockers: [
        {
          id: 'publish-content',
          label: 'Participant content still blocks publish',
          stepId: 'content',
          severity: 'blocker',
          kind: 'publish',
        },
      ],
    });

    fireEvent.click(screen.getAllByRole('button', { name: /wizardShell.steps.review/i })[0]!);

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('wizardShell.review.recheckingTitle')).toBeInTheDocument();
    expect(screen.getByText('wizardShell.review.recheckingBody')).toBeInTheDocument();
    expect(screen.queryByText('Participant content still blocks publish')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /wizardShell.review.goToFirstBlocker/i })).not.toBeInTheDocument();
  });

  it('shows refreshed review readiness once fresh server props arrive', () => {
    const view = renderShell({
      steps: buildSteps({ content: { completed: true } }),
      initialStepId: 'content',
      reviewBlockers: [
        {
          id: 'publish-content',
          label: 'Participant content still blocks publish',
          stepId: 'content',
          severity: 'blocker',
          kind: 'publish',
        },
      ],
      reviewPayloadToken: 'review-token-stale',
    });

    fireEvent.click(screen.getAllByRole('button', { name: /wizardShell.steps.review/i })[0]!);

    view.rerender(
      <EventSetupWizardShell
        eventId="evt-1"
        eventName="TrailMX 2026"
        organizationName="TrailMX"
        statusLabel="Draft"
        exitHref={{ pathname: '/dashboard/events/[eventId]/settings', params: { eventId: 'evt-1' } }}
        steps={buildSteps({ content: { completed: true }, review: { completed: true } })}
        reviewControls={<div>review-controls</div>}
        reviewBlockers={[]}
        reviewRecommendations={[]}
        reviewPayloadToken="review-token-fresh"
        initialStepId="content"
      />,
    );

    expect(screen.queryByText('wizardShell.review.recheckingTitle')).not.toBeInTheDocument();
    expect(screen.getByText('wizardShell.review.readyTitle')).toBeInTheDocument();
    expect(screen.getByText('wizardShell.review.noBlockers')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /wizardShell.review.openPublishControls/i })).toBeInTheDocument();
  });

  it('uses the softer review state when blockers are clear but recommendations remain', () => {
    renderShell({
      steps: buildSteps({ review: { completed: true } }),
      initialStepId: 'review',
      reviewRecommendations: [
        {
          id: 'recommend-waivers',
          label: 'Add participant waiver',
          stepId: 'policies',
          severity: 'optional',
          kind: 'optional',
        },
      ],
    });

    expect(screen.getByText('wizardShell.review.reviewRecommendedTitle')).toBeInTheDocument();
    expect(screen.getByText('wizardShell.review.noRequiredBlockers')).toBeInTheDocument();
    expect(screen.queryByText('wizardShell.review.readyTitle')).not.toBeInTheDocument();
  });

  it('keeps the truly ready state available when review has no blockers or recommendations', () => {
    renderShell({
      steps: buildSteps({ review: { completed: true } }),
      initialStepId: 'review',
      reviewRecommendations: [],
    });

    expect(screen.getByText('wizardShell.review.readyTitle')).toBeInTheDocument();
    expect(screen.getByText('wizardShell.review.noBlockers')).toBeInTheDocument();
    expect(screen.queryByText('wizardShell.review.reviewRecommendedTitle')).not.toBeInTheDocument();
  });

  it('prefers an explicit initial step over saved session state', () => {
    window.sessionStorage.setItem('event-setup-wizard:active-step:evt-1', 'pricing');

    renderShell({ steps: buildSteps(), initialStepId: 'content' });

    expect(screen.getByText('content-step-body')).toBeInTheDocument();
  });

  it('routes from review blockers back to the blocking step and updates the step query', () => {
    renderShell({
      steps: buildSteps({ review: { completed: false } }),
      initialStepId: 'review',
      reviewBlockers: [
        {
          id: 'publish-pricing',
          label: 'Add pricing before publishing',
          stepId: 'pricing',
          severity: 'blocker',
          kind: 'publish',
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: /wizardShell.review.goToFirstBlocker/i }));

    expect(screen.getByText('pricing-step-body')).toBeInTheDocument();
    expect(window.location.search).toContain('step=pricing');
  });

  it('pushes history entries for wizard step navigation and restores prior steps on popstate', () => {
    renderShell({ steps: buildSteps(), initialStepId: 'pricing' });

    fireEvent.click(screen.getByRole('button', { name: /wizardShell.navigation.next/i }));
    expect(screen.getByText('registration-step-body')).toBeInTheDocument();
    expect(pushStateSpy).toHaveBeenCalled();
    expect(window.location.search).toContain('step=registration');

    window.history.replaceState({}, '', '/?wizard=1&step=pricing');
    fireEvent(window, new PopStateEvent('popstate'));

    expect(screen.getByText('pricing-step-body')).toBeInTheDocument();
    expect(window.location.search).toContain('step=pricing');
  });
});

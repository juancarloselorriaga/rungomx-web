import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';

import { EventAiWizardPanel } from '@/app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-ai-wizard-panel';

const mockPush = jest.fn();
const mockRefresh = jest.fn();
const mockSetAssistantOpen = jest.fn();
const mockSendMessage = jest.fn();
const mockStop = jest.fn();
const mockClearError = jest.fn();
const mockUpdateEventEdition = jest.fn();
let mockUseChatConfig: Record<string, unknown> | null = null;
let mockTransportOptions: Record<string, unknown> | null = null;
const mockFetch = jest.fn();

let mockChatState = {
  messages: [] as Array<{
    id: string;
    role: 'user' | 'assistant';
    parts: Array<{ type: string; text?: string; data?: unknown }>;
  }>,
  status: 'ready',
  error: undefined as Error | undefined,
};

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === 'wizard.issues.publishMissingDistance') return 'Add at least one distance';
    if (key === 'wizardShell.steps.content') return 'Participant content';
    if (key === 'wizardShell.steps.basics') return 'Basics';
    if (key === 'wizardShell.steps.review') return 'Review';
    if (key === 'routing.intentLabels.draft_website_overview') return 'Draft website overview';
    if (key === 'routing.stepActions.content') return 'Prepare participant content';
    if (key === 'routing.stepActions.basics') return 'Finish event basics';
    if (key === 'routing.stepActions.review') return 'Review before publishing';
    if (key === 'routing.intentStepFallback') return `Continue in ${values?.step}`;
    if (key === 'routing.goToStep') return `Go to ${values?.step}`;
    if (key === 'latestProposal.supportingContextTitle') return 'Supporting context';
    if (key === 'latestProposal.supportingContextDescription')
      return `See the latest request and response plus ${values?.count} earlier messages.`;
    if (key === 'continuity.eyebrow') return 'Your thread is still here';
    if (key === 'continuity.title') return `Still carrying the latest proposal from ${values?.step}`;
    if (key === 'continuity.description') return 'Your last useful exchange stays visible while you continue.';
    if (key === 'appliedState.eyebrow') return 'Changes already applied';
    if (key === 'appliedState.revealEditor') return 'See them in the editor';
    if (key === 'errors.requestFailedHint') return 'Try again in a moment.';
    if (key === 'errors.safety.promptInjection') return 'That request is outside event setup.';
    if (key === 'errors.safety.policyViolation') return 'That request cannot be handled here.';
    if (key === 'errors.readOnlyDescription') return 'Read-only membership.';
    if (key === 'errors.rateLimited') return 'Too many requests.';
    if (key === 'errors.proRequired') return 'Pro required.';
    if (key === 'errors.disabled') return 'Assistant disabled.';
    if (key === 'brief.useForStepPrompt') return `Use saved notes for ${values?.step}`;
    if (key === 'progress.analyzing.title') return 'Reviewing your request';
    if (key === 'progress.analyzing.description') return `Checking ${values?.step} before drafting.`;
    if (key === 'progress.grounding.title') return 'Grounding the proposal';
    if (key === 'progress.grounding.description') return `Cross-checking saved details for ${values?.step}.`;
    if (key === 'progress.drafting.title') return 'Drafting your next move';
    if (key === 'progress.drafting.description') return `Shaping organizer-friendly guidance for ${values?.step}.`;
    if (key === 'progress.finalizing.title') return 'Preparing the proposal card';
    if (key === 'progress.finalizing.description') return 'Packaging the recommendation for safe review.';
    if (key === 'fastPath.eyebrow') return 'Early structure';
    if (key === 'fastPath.faq.title') return 'Starting with a usable FAQ structure';
    if (key === 'fastPath.faq.description')
      return 'I can draft the first answers faster by organizing the FAQ around the most likely participant questions.';
    if (key === 'fastPath.faq.sections.event_basics')
      return 'What the event is, who it is for, and the essentials participants need first.';
    if (key === 'fastPath.faq.sections.route_and_distances')
      return 'Grounded route or distance details that are already confirmed.';
    if (key === 'fastPath.faq.sections.registration_and_logistics')
      return 'Registration, timing, and logistics only where the current setup supports them.';
    if (key === 'earlyProse.eyebrow') return 'Early draft';
    if (key === 'scaffold.eyebrow') return 'Proposal in progress';
    if (key === 'scaffold.content.title') return 'I already have a content draft plan forming';
    if (key === 'scaffold.content.description')
      return 'The final proposal is still coming, but this is the structure I am using to keep it useful and publishable.';
    if (key === 'scaffold.content.sections.first_pass')
      return 'Draft the most useful participant-facing section first instead of waiting for every detail.';
    if (key === 'scaffold.content.sections.confirmed_facts')
      return 'Anchor the copy in confirmed event details, saved notes, and localized content already on the event.';
    if (key === 'scaffold.content.sections.open_points')
      return 'Keep missing logistics clearly pending instead of filling them with generic promises.';
    if (key === 'latency.slow.title') return 'Still shaping a grounded proposal';
    if (key === 'latency.slow.description')
      return 'This request needs a little more time because I am cross-checking your event details before I suggest anything.';
    if (key === 'latency.verySlow.title') return 'Taking extra care with the final proposal';
    if (key === 'latency.verySlow.description')
      return 'I am still working through your notes and confirmed event data so the recommendation stays useful and safe to apply.';
    if (values?.step) return `${key}:${values.step}`;
    return key;
  },
  useLocale: () => 'en',
}));

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

jest.mock(
  '@/app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-assistant-workspace-state',
  () => ({
    useAssistantWorkspaceQueryState: () => ({
      isOpen: true,
      setOpen: mockSetAssistantOpen,
    }),
  }),
);

jest.mock('@ai-sdk/react', () => ({
  useChat: (config: Record<string, unknown>) => {
    mockUseChatConfig = config;
    return {
      messages: mockChatState.messages,
      status: mockChatState.status,
      sendMessage: mockSendMessage,
      stop: mockStop,
      error: mockChatState.error,
      clearError: mockClearError,
    };
  },
}));

jest.mock('ai', () => ({
  DefaultChatTransport: class DefaultChatTransport {
    constructor(options: Record<string, unknown>) {
      mockTransportOptions = options;
    }
  },
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/lib/events/actions', () => ({
  updateEventEdition: (...args: unknown[]) => mockUpdateEventEdition(...args),
}));

jest.mock('@/components/markdown/markdown-content', () => ({
  MarkdownContent: ({ content }: { content: string }) => {
    const headingMatch = content.match(/^##\s+(.+)$/m);
    return (
      <div data-testid="markdown-content">
        {headingMatch ? <h2>{headingMatch[1]}</h2> : null}
        <p>{content}</p>
      </div>
    );
  },
}));

function openDetailsBySummaryText(summaryText: string) {
  const summary = screen.getByText(summaryText).closest('summary');
  const details = summary?.closest('details');

  if (!details) {
    throw new Error(`Could not find details for summary: ${summaryText}`);
  }

  details.setAttribute('open', '');
  return details;
}

describe('EventAiWizardPanel', () => {
  beforeEach(() => {
    jest.useRealTimers();
    global.fetch = mockFetch as unknown as typeof fetch;
    window.sessionStorage.clear();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: jest.fn(),
    });
    mockPush.mockReset();
    mockRefresh.mockReset();
    mockSetAssistantOpen.mockReset();
    mockSendMessage.mockReset();
    mockStop.mockReset();
    mockClearError.mockReset();
    mockUpdateEventEdition.mockReset();
    mockUseChatConfig = null;
    mockTransportOptions = null;
    mockFetch.mockReset();
    mockUpdateEventEdition.mockResolvedValue({
      ok: true,
      data: {
        id: 'evt-1',
        publicCode: 'ABC123',
        editionLabel: '2026',
        slug: '2026',
        visibility: 'draft',
        seriesId: 'series-1',
      },
    });
    mockChatState = {
      messages: [],
      status: 'ready',
      error: undefined,
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads a quick prompt into the composer', () => {
    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="basics"
        stepTitle="Event basics"
        suggestions={['Draft from brief']}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Draft from brief' }));

    expect(screen.getByRole('textbox')).toHaveValue('Draft from brief');
  });

  it('shows a rough-notes affordance in the composer for non-technical organizers', () => {
    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    expect(screen.getByText('composer.roughNotesTitle')).toBeInTheDocument();
    expect(screen.getByText('composer.roughNotesExample')).toBeInTheDocument();
  });

  it('does not show the markdown badge for basics assistance', () => {
    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="basics"
        stepTitle="Event basics"
        suggestions={['Draft from brief']}
      />,
    );

    expect(screen.queryByText('inline.markdownBadge')).not.toBeInTheDocument();
  });

  it('keeps the markdown badge on markdown-first steps', () => {
    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
        markdownFocus
      />,
    );

    expect(screen.getByText('inline.markdownBadge')).toBeInTheDocument();
  });

  it('sends a basics prompt without overwriting the shared brief', async () => {
    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="basics"
        stepTitle="Event basics"
        suggestions={['Draft from brief']}
        initialEventBrief="Saved organizer brief"
      />,
    );

    fireEvent.change(screen.getByLabelText('composer.label'), {
      target: { value: 'Half marathon in Guadalajara with a polished markdown description.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith({
        text: 'Half marathon in Guadalajara with a polished markdown description.',
      });
    });
    expect(mockUpdateEventEdition).not.toHaveBeenCalled();
    expect(screen.getByText('brief.savedLabel')).toBeInTheDocument();
    expect(window.sessionStorage.getItem('event-ai-wizard:brief:evt-1')).toBe('Saved organizer brief');
  });

  it('renders review-before-apply proposal cards inline', () => {
    mockChatState = {
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'I drafted a participant-facing improvement.' },
            {
              type: 'data-event-patch',
              data: {
                title: 'Improve event description',
                summary: 'Adds polished markdown for the event summary.',
                ops: [
                  {
                    type: 'update_edition',
                    editionId: '68ca6035-7c0f-4ff6-b3c2-651f81e5a8a4',
                    data: {
                      description: '## Race day\nA scenic race experience.',
                    },
                  },
                ],
                markdownOutputs: [
                  {
                    domain: 'description',
                    title: 'Event description',
                    contentMarkdown: '## Race day\nA scenic race experience.',
                  },
                ],
              },
            },
          ],
        },
      ],
      status: 'ready',
      error: undefined,
    };

    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
        markdownFocus
        initialEventBrief={null}
      />,
    );

    expect(screen.getByText('Improve event description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'apply' })).toBeInTheDocument();
    expect(screen.getByText('Event description')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Race day' })).toBeInTheDocument();
    const proposalDetails = screen.getByText('latestProposal.detailsTitle').closest('details');
    expect(proposalDetails).not.toHaveAttribute('open');
    openDetailsBySummaryText('latestProposal.detailsTitle');
    expect(proposalDetails).toHaveAttribute('open');
    expect(screen.getByText('ops.updateEvent')).toBeInTheDocument();
  });

  it('surfaces the latest proposal before saved notes and moves earlier chat into an archive', () => {
    mockChatState = {
      messages: [
        {
          id: 'user-older',
          role: 'user',
          parts: [{ type: 'text', text: 'Old question that should move into the archive.' }],
        },
        {
          id: 'assistant-older',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Old answer that should no longer dominate the panel.' }],
        },
        {
          id: 'user-latest',
          role: 'user',
          parts: [{ type: 'text', text: 'Please improve the participant content.' }],
        },
        {
          id: 'assistant-latest',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Here is the newest recommendation for this step.' },
            {
              type: 'data-event-patch',
              data: {
                title: 'Polish participant copy',
                summary: 'Creates clearer participant-facing messaging.',
                ops: [
                  {
                    type: 'update_edition',
                    editionId: '68ca6035-7c0f-4ff6-b3c2-651f81e5a8a4',
                    data: {
                      description: '## Ready to race\nClear, grounded participant copy.',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
      status: 'ready',
      error: undefined,
    };

    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
        initialEventBrief="Saved notes from the server"
      />,
    );

    const latestProposal = screen.getByText('latestProposal.title');
    const savedNotes = screen.getByText('brief.savedLabel');

    expect(screen.getByText('Supporting context')).toBeInTheDocument();
    expect(screen.getAllByText('archive.title')).toHaveLength(1);
    openDetailsBySummaryText('Supporting context');
    expect(screen.getByText('Please improve the participant content.')).toBeInTheDocument();
    expect(screen.getByText('Here is the newest recommendation for this step.')).toBeInTheDocument();
    expect(screen.getByText('Old question that should move into the archive.')).toBeInTheDocument();
    expect(latestProposal.compareDocumentPosition(savedNotes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders only the latest authoritative patch when the final assistant message includes repeated patch parts', () => {
    mockChatState = {
      messages: [
        {
          id: 'assistant-latest',
          role: 'assistant',
          parts: [
            {
              type: 'data-event-patch',
              data: {
                title: 'Older draft',
                summary: 'Should not stay visible once a newer patch is present.',
                ops: [
                  {
                    type: 'update_edition',
                    editionId: '68ca6035-7c0f-4ff6-b3c2-651f81e5a8a4',
                    data: { description: 'Older description' },
                  },
                ],
              },
            },
            {
              type: 'data-event-patch',
              data: {
                title: 'Newest draft',
                summary: 'This is the only authoritative proposal that should remain visible.',
                ops: [
                  {
                    type: 'update_edition',
                    editionId: '68ca6035-7c0f-4ff6-b3c2-651f81e5a8a4',
                    data: { description: 'Newest description' },
                  },
                ],
              },
            },
          ],
        },
      ],
      status: 'ready',
      error: undefined,
    };

    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
        initialEventBrief={null}
      />,
    );

    expect(screen.queryByText('Older draft')).not.toBeInTheDocument();
    expect(screen.getByText('Newest draft')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'apply' })).toHaveLength(1);
  });

  it('localizes routing labels when the model returns known intent keys', () => {
    mockChatState = {
      messages: [
        {
          id: 'assistant-2',
          role: 'assistant',
          parts: [
            {
              type: 'data-event-patch',
              data: {
                title: 'Route the organizer',
                summary: 'Guide the next step.',
                ops: [
                  {
                    type: 'create_faq_item',
                    editionId: '68ca6035-7c0f-4ff6-b3c2-651f81e5a8a4',
                    data: {
                      question: 'What is included?',
                      answerMarkdown: 'Trail access and timing support.',
                    },
                  },
                ],
                missingFieldsChecklist: [
                  {
                    code: 'MISSING_DISTANCE',
                    stepId: 'review',
                    label: 'wizard.issues.publishMissingDistance',
                    severity: 'blocker',
                  },
                ],
                intentRouting: [
                  {
                    intent: 'draft_website_overview',
                    stepId: 'content',
                  },
                ],
              },
            },
          ],
        },
      ],
      status: 'ready',
      error: undefined,
    };

    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="review"
        stepTitle="Review"
        suggestions={['Fix blockers']}
      />,
    );

    openDetailsBySummaryText('latestProposal.detailsTitle');
    expect(screen.getByText('Add at least one distance')).toBeInTheDocument();
    expect(screen.getByText('Draft website overview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to Participant content' })).toBeInTheDocument();
  });

  it('falls back to a step-specific localized label for unknown intent tokens', () => {
    mockChatState = {
      messages: [
        {
          id: 'assistant-unknown',
          role: 'assistant',
          parts: [
            {
              type: 'data-event-patch',
              data: {
                title: 'Route the organizer',
                summary: 'Guide the next step.',
                ops: [
                  {
                    type: 'create_faq_item',
                    editionId: '68ca6035-7c0f-4ff6-b3c2-651f81e5a8a4',
                    data: {
                      question: 'What is included?',
                      answerMarkdown: 'Trail access and timing support.',
                    },
                  },
                ],
                intentRouting: [
                  {
                    intent: 'go_to_unknown_future_step',
                    stepId: 'content',
                    rationale: 'Raw rationale should not be shown here.',
                  },
                ],
              },
            },
          ],
        },
      ],
      status: 'ready',
      error: undefined,
    };

    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="review"
        stepTitle="Review"
        suggestions={['Fix blockers']}
      />,
    );

    openDetailsBySummaryText('latestProposal.detailsTitle');
    expect(screen.getByText('Prepare participant content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to Participant content' })).toBeInTheDocument();
    expect(screen.queryByText('Go To Unknown Future Step')).not.toBeInTheDocument();
    expect(screen.queryByText('Raw rationale should not be shown here.')).not.toBeInTheDocument();
  });

  it('deduplicates multiple assistant routes that point to the same step', () => {
    mockChatState = {
      messages: [
        {
          id: 'assistant-dedupe',
          role: 'assistant',
          parts: [
            {
              type: 'data-event-patch',
              data: {
                title: 'Route the organizer',
                summary: 'Guide the next step.',
                ops: [
                  {
                    type: 'create_faq_item',
                    editionId: '68ca6035-7c0f-4ff6-b3c2-651f81e5a8a4',
                    data: {
                      question: 'What is included?',
                      answerMarkdown: 'Trail access and timing support.',
                    },
                  },
                ],
                intentRouting: [
                  {
                    intent: 'go_to_unknown_future_step',
                    stepId: 'content',
                  },
                  {
                    intent: 'draft_website_overview',
                    stepId: 'content',
                  },
                  {
                    intent: 'another_unknown_intent',
                    stepId: 'content',
                  },
                ],
              },
            },
          ],
        },
      ],
      status: 'ready',
      error: undefined,
    };

    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="review"
        stepTitle="Review"
        suggestions={['Fix blockers']}
      />,
    );

    openDetailsBySummaryText('latestProposal.detailsTitle');
    expect(screen.getByText('Draft website overview')).toBeInTheDocument();
    expect(screen.queryByText('Prepare participant content')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Go to Participant content' })).toHaveLength(1);
  });

  it('maps structured chat safety errors to localized organizer copy', () => {
    mockChatState = {
      messages: [],
      status: 'error',
      error: new Error(JSON.stringify({ code: 'SAFETY_BLOCKED', category: 'prompt_injection' })),
    };

    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('That request is outside event setup.');
  });

  it('shows staged organizer-facing progress from transient stream notifications', () => {
    mockChatState = {
      messages: [],
      status: 'streaming',
      error: undefined,
    };

    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    const onData = (mockUseChatConfig as { onData?: (part: { type: string; data: unknown }) => void })?.onData;
    expect(onData).toBeDefined();

    act(() => {
      onData?.({
        type: 'data-notification',
        data: { code: 'grounding_snapshot', level: 'info' },
      });
    });

    expect(screen.getByText('Grounding the proposal')).toHaveClass('assistant-working-label');
    expect(screen.getByText('Cross-checking saved details for Participant content.')).toBeInTheDocument();
  });

  it('renders an early fast-path structure before the final proposal exists', () => {
    mockChatState = {
      messages: [],
      status: 'streaming',
      error: undefined,
    };

    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    const onData = (mockUseChatConfig as { onData?: (part: { type: string; data: unknown }) => void })?.onData;
    expect(onData).toBeDefined();

    act(() => {
      onData?.({
        type: 'data-fast-path-structure',
        data: {
          kind: 'faq',
          sectionKeys: ['event_basics', 'route_and_distances', 'registration_and_logistics'],
        },
      });
    });

    expect(screen.getByText('Early structure')).toBeInTheDocument();
    expect(screen.getByText('Starting with a usable FAQ structure')).toBeInTheDocument();
    expect(screen.getByText('Grounded route or distance details that are already confirmed.')).toBeInTheDocument();
  });

  it('renders an early grounded prose lead before the final proposal exists', () => {
    mockChatState = {
      messages: [],
      status: 'streaming',
      error: undefined,
    };

    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    const onData = (mockUseChatConfig as { onData?: (part: { type: string; data: unknown }) => void })?.onData;
    expect(onData).toBeDefined();

    act(() => {
      onData?.({
        type: 'data-early-prose',
        data: {
          body: 'I’m starting from the confirmed details so the first participant-facing draft stays grounded.',
        },
      });
    });

    expect(screen.getByText('Early draft')).toBeInTheDocument();
    expect(
      screen.getByText(
        'I’m starting from the confirmed details so the first participant-facing draft stays grounded.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a localized scaffold for slow broad generations before the proposal arrives', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-12T10:00:00.000Z'));

    mockChatState = {
      messages: [],
      status: 'ready',
      error: undefined,
    };

    const { rerender } = render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    fireEvent.change(screen.getByLabelText('composer.label'), {
      target: { value: 'Ayúdame con esto' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    mockChatState = {
      messages: [],
      status: 'streaming',
      error: undefined,
    };

    rerender(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(screen.getByText('Proposal in progress')).toBeInTheDocument();
    expect(screen.getByText('I already have a content draft plan forming')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Anchor the copy in confirmed event details, saved notes, and localized content already on the event.',
      ),
    ).toBeInTheDocument();
  });

  it('surfaces early streamed assistant text before a final patch exists', () => {
    mockChatState = {
      messages: [
        {
          id: 'user-inflight',
          role: 'user',
          parts: [{ type: 'text', text: 'Help me improve the participant content.' }],
        },
        {
          id: 'assistant-inflight',
          role: 'assistant',
          parts: [{ type: 'text', text: 'I am organizing your notes into a clearer participant-facing draft.' }],
        },
      ],
      status: 'streaming',
      error: undefined,
    };

    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    expect(screen.getByText('I am organizing your notes into a clearer participant-facing draft.')).toBeInTheDocument();
    expect(screen.getByText('latestProposal.pendingTitle')).toBeInTheDocument();
  });

  it('captures visible latency checkpoints as data attributes', async () => {
    const requestStartedAt = 1_710_000_000_000;
    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(requestStartedAt - 1_000)
      .mockReturnValueOnce(requestStartedAt)
      .mockReturnValueOnce(requestStartedAt + 250)
      .mockReturnValueOnce(requestStartedAt + 400)
      .mockReturnValueOnce(requestStartedAt + 600)
      .mockReturnValueOnce(requestStartedAt + 1200);

    mockChatState = {
      messages: [],
      status: 'ready',
      error: undefined,
    };

    const { rerender, container } = render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    fireEvent.change(screen.getByLabelText('composer.label'), {
      target: { value: 'Turn these notes into content.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    const onData = (mockUseChatConfig as { onData?: (part: { type: string; data: unknown }) => void })?.onData;

    act(() => {
      onData?.({
        type: 'data-notification',
        data: { code: 'grounding_snapshot', level: 'info' },
      });
    });

    act(() => {
      onData?.({
        type: 'data-fast-path-structure',
        data: {
          kind: 'faq',
          sectionKeys: ['event_basics', 'route_and_distances', 'registration_and_logistics'],
        },
      });
    });

    mockChatState = {
      messages: [
        {
          id: 'assistant-inflight',
          role: 'assistant',
          parts: [{ type: 'text', text: 'I am organizing your notes into clearer content.' }],
        },
      ],
      status: 'streaming',
      error: undefined,
    };

    rerender(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    mockChatState = {
      messages: [
        {
          id: 'assistant-ready',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Here is the proposal.' },
            {
              type: 'data-event-patch',
              data: {
                title: 'Improve content',
                summary: 'Adds cleaner participant-facing copy.',
                ops: [
                  {
                    type: 'update_edition',
                    editionId: 'evt-1',
                    data: {
                      description: '## Ready to race\nGrounded content.',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
      status: 'ready',
      error: undefined,
    };

    rerender(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    const section = container.querySelector('section[data-latency-request-started-at]');
    await waitFor(() => {
      expect(section).toHaveAttribute('data-latency-request-started-at', String(requestStartedAt));
      expect(section).toHaveAttribute('data-latency-first-progress-ms', '250');
      expect(section).toHaveAttribute('data-latency-first-structure-ms', '400');
      expect(section).toHaveAttribute('data-latency-first-text-ms', '600');
      expect(section).toHaveAttribute('data-latency-proposal-ready-ms', '600');
    });
  });

  it('shows reassuring slow feedback while generation is still running', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-12T10:00:00.000Z'));

    mockChatState = {
      messages: [],
      status: 'ready',
      error: undefined,
    };

    const { rerender } = render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    fireEvent.change(screen.getByLabelText('composer.label'), {
      target: { value: 'Turn these notes into content.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    mockChatState = {
      messages: [],
      status: 'streaming',
      error: undefined,
    };

    rerender(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(4500);
    });

    expect(screen.getByText('Still shaping a grounded proposal')).toHaveClass('assistant-working-label');
    expect(
      screen.getByText(
        'This request needs a little more time because I am cross-checking your event details before I suggest anything.',
      ),
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(screen.getByText('Taking extra care with the final proposal')).toHaveClass('assistant-working-label');
    expect(
      screen.getByText(
        'I am still working through your notes and confirmed event data so the recommendation stays useful and safe to apply.',
      ),
    ).toBeInTheDocument();
  });

  it('hides the slow scaffold once the final proposal arrives', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-12T10:00:00.000Z'));

    mockChatState = {
      messages: [],
      status: 'ready',
      error: undefined,
    };

    const { rerender } = render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    fireEvent.change(screen.getByLabelText('composer.label'), {
      target: { value: 'Ayúdame con esto' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    mockChatState = {
      messages: [],
      status: 'streaming',
      error: undefined,
    };

    rerender(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(screen.getByText('Proposal in progress')).toBeInTheDocument();

    mockChatState = {
      messages: [
        {
          id: 'assistant-ready',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Here is the proposal.' },
            {
              type: 'data-event-patch',
              data: {
                title: 'Improve content',
                summary: 'Adds cleaner participant-facing copy.',
                ops: [
                  {
                    type: 'update_edition',
                    editionId: 'evt-1',
                    data: {
                      description: '## Ready to race\nGrounded content.',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
      status: 'ready',
      error: undefined,
    };

    rerender(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    expect(screen.queryByText('Proposal in progress')).not.toBeInTheDocument();
    expect(screen.getByText('latestProposal.title')).toBeInTheDocument();
  });

  it('hides an older proposal when a newer user turn is now pending', () => {
    mockChatState = {
      messages: [
        {
          id: 'assistant-old',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Here is the prior proposal.' },
            {
              type: 'data-event-patch',
              data: {
                title: 'Prior patch',
                summary: 'Old proposal summary.',
                ops: [
                  {
                    type: 'update_edition',
                    editionId: 'evt-1',
                    data: {
                      description: '## Old draft\nPrevious copy.',
                    },
                  },
                ],
              },
            },
          ],
        },
        {
          id: 'user-new',
          role: 'user',
          parts: [{ type: 'text', text: 'Try a new direction.' }],
        },
      ],
      status: 'streaming',
      error: undefined,
    };

    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    expect(screen.queryByText('latestProposal.title')).not.toBeInTheDocument();
    expect(screen.getByText('latestProposal.pendingTitle')).toBeInTheDocument();
  });

  it('loads the saved server brief immediately and mirrors it into session storage', async () => {
    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
        initialEventBrief="Server-side organizer brief"
      />,
    );

    expect(screen.getByText('brief.savedLabel')).toBeInTheDocument();
    const briefDisclosure = screen.getByText('brief.savedLabel').closest('details');
    expect(briefDisclosure).not.toHaveAttribute('open');
    openDetailsBySummaryText('brief.savedLabel');
    expect(briefDisclosure).toHaveAttribute('open');
    expect(screen.getByText('Server-side organizer brief')).toBeInTheDocument();

    await waitFor(() => {
      expect(window.sessionStorage.getItem('event-ai-wizard:brief:evt-1')).toBe('Server-side organizer brief');
    });
  });

  it('keeps the saved event notes separate from the live composer and uses them through a direct assistant action', async () => {
    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
        initialEventBrief="Shared brief from the server"
      />,
    );

    const briefDisclosure = screen.getByText('brief.savedLabel').closest('details');
    expect(briefDisclosure).not.toHaveAttribute('open');
    expect(screen.getByLabelText('composer.label')).toHaveValue('');
    expect(mockTransportOptions).toMatchObject({
      body: {
        editionId: 'evt-1',
        stepId: 'content',
        locale: 'en',
        eventBrief: 'Shared brief from the server',
      },
    });

    openDetailsBySummaryText('brief.savedLabel');
    expect(briefDisclosure).toHaveAttribute('open');
    expect(screen.getByText('Shared brief from the server')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'brief.useForStep' }));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith({
        text: 'Use saved notes for Participant content',
      });
    });

    expect(screen.getByText('Shared brief from the server')).toBeInTheDocument();
    expect(screen.getByLabelText('composer.label')).toHaveValue('');
    expect(mockUseChatConfig).not.toBeNull();
    expect(mockTransportOptions).toMatchObject({
      body: {
        locale: 'en',
        eventBrief: 'Shared brief from the server',
      },
    });
  });

  it('persists a shared brief only through the explicit brief editor flow', async () => {
    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="basics"
        stepTitle="Event basics"
        suggestions={['Draft from brief']}
        initialEventBrief={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'brief.add' }));
    fireEvent.change(screen.getByLabelText('brief.inputLabel'), {
      target: { value: 'Server-backed brief for the basics step.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'brief.save' }));

    await waitFor(() => {
      expect(mockUpdateEventEdition).toHaveBeenCalledWith({
        editionId: 'evt-1',
        organizerBrief: 'Server-backed brief for the basics step.',
      });
    });

    await waitFor(() => {
      expect(window.sessionStorage.getItem('event-ai-wizard:brief:evt-1')).toBe(
        'Server-backed brief for the basics step.',
      );
    });
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows a localized generic assistant error hint instead of the raw error message', () => {
    mockChatState = {
      messages: [],
      status: 'error',
      error: new Error('Raw SDK error should stay hidden'),
    };

    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    expect(screen.getByText('Try again in a moment.')).toBeInTheDocument();
    expect(screen.queryByText('Raw SDK error should stay hidden')).not.toBeInTheDocument();
  });

  it('localizes brief-save failures instead of showing the raw backend message', async () => {
    mockUpdateEventEdition.mockResolvedValue({
      ok: false,
      code: 'FORBIDDEN',
      error: 'Permission denied',
    });

    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="basics"
        stepTitle="Event basics"
        suggestions={['Draft from brief']}
        initialEventBrief={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'brief.add' }));
    fireEvent.change(screen.getByLabelText('brief.inputLabel'), {
      target: { value: 'Server-backed brief for the basics step.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'brief.save' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Read-only membership.');
    });
  });

  it('applies the visible proposal UI and refreshes on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, applied: [] }),
    });
    mockChatState = {
      messages: [
        {
          id: 'assistant-apply-success',
          role: 'assistant',
          parts: [
            {
              type: 'data-event-patch',
              data: {
                title: 'Create FAQ',
                summary: 'Adds one FAQ item.',
                ops: [
                  {
                    type: 'create_faq_item',
                    editionId: 'evt-1',
                    data: {
                      question: 'What is included?',
                      answerMarkdown: 'Trail access and timing support.',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
      status: 'ready',
      error: undefined,
    };

    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'apply' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/events/ai-wizard/apply', expect.objectContaining({
        method: 'POST',
      }));
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('applied');
    });
    expect(mockRefresh).toHaveBeenCalled();
    expect(screen.getByText('Changes already applied')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'See them in the editor' }));
    expect(mockSetAssistantOpen).toHaveBeenCalledWith(false);
  });

  it('shows a localized invalid-patch message when the visible Apply UI fails validation', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ code: 'INVALID_PATCH', applied: [] }),
    });
    mockChatState = {
      messages: [
        {
          id: 'assistant-apply-invalid',
          role: 'assistant',
          parts: [
            {
              type: 'data-event-patch',
              data: {
                title: 'Create FAQ',
                summary: 'Adds one FAQ item.',
                ops: [
                  {
                    type: 'create_faq_item',
                    editionId: 'evt-1',
                    data: {
                      question: 'What is included?',
                      answerMarkdown: 'Trail access and timing support.',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
      status: 'ready',
      error: undefined,
    };

    render(
      <EventAiWizardPanel
        editionId="evt-1"
        stepId="content"
        stepTitle="Participant content"
        suggestions={['Improve participant-facing copy']}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'apply' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('errors.invalid');
    });
  });
});

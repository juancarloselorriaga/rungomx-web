import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CreateEventForm } from '@/app/[locale]/(protected-fullscreen)/dashboard/events/new/create-event-form';

const mockPush = jest.fn();
const mockCreateOrganization = jest.fn();
const mockCreateEventStepAction = jest.fn();

jest.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
  useLocale: () => 'en',
}));

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('next/dynamic', () => () => {
  const MockLocationField = () => <div data-testid="location-field" />;
  MockLocationField.displayName = 'MockLocationField';
  return MockLocationField;
});

jest.mock('@/lib/organizations/actions', () => ({
  createOrganization: (...args: unknown[]) => mockCreateOrganization(...args),
}));

jest.mock('@/app/actions/events-create', () => ({
  createEventStepAction: (...args: unknown[]) => mockCreateEventStepAction(...args),
}));

jest.mock('@/lib/events/actions', () => ({
  checkSlugAvailability: jest.fn(),
}));

jest.mock('@/components/ui/markdown-field', () => ({
  MarkdownField: ({
    label,
    value,
    onChange,
    helperText,
  }: {
    label: React.ReactNode;
    value: string;
    onChange: (value: string) => void;
    helperText?: React.ReactNode;
  }) => (
    <label>
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} />
      {helperText ? <p>{helperText}</p> : null}
    </label>
  ),
}));

const organizations = [
  {
    id: 'org-1',
    name: 'TrailMX',
    slug: 'trailmx',
    role: 'owner',
    series: [],
  },
];

describe('CreateEventForm', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockCreateOrganization.mockReset();
    mockCreateEventStepAction.mockReset();
    mockCreateOrganization.mockResolvedValue({
      ok: true,
      data: { id: 'org-2', name: 'New org', slug: 'new-org' },
    });
    mockCreateEventStepAction.mockResolvedValue({
      ok: true,
      data: { eventId: 'edition-1' },
    });
  });

  it('shows description guidance and the Pro AI context disclosure on the event step', () => {
    render(<CreateEventForm organizations={organizations} showAiContextDisclosure />);

    fireEvent.click(
      screen.getByRole('button', { name: 'pages.dashboardEvents.createEvent.steps.continue' }),
    );

    expect(
      screen.getByText('pages.dashboardEvents.createEvent.event.descriptionHelper'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /pages.dashboardEvents.createEvent.event.aiContextTrigger/i,
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: /pages.dashboardEvents.createEvent.event.aiContextTrigger/i,
      }),
    );

    expect(
      screen.getByText('pages.dashboardEvents.createEvent.event.aiContextLabel'),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('pages.dashboardEvents.createEvent.event.aiContextPlaceholder'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('pages.dashboardEvents.createEvent.event.aiContextHelper'),
    ).toBeInTheDocument();
  });

  it('keeps the create form lightweight for non-Pro users', () => {
    render(<CreateEventForm organizations={organizations} showAiContextDisclosure={false} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'pages.dashboardEvents.createEvent.steps.continue' }),
    );

    expect(
      screen.getByText('pages.dashboardEvents.createEvent.event.descriptionHelper'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('pages.dashboardEvents.createEvent.event.aiContextTrigger'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('pages.dashboardEvents.createEvent.event.aiContextLabel'),
    ).not.toBeInTheDocument();
  });

  it('maps organization creation errors to localized organizer copy', async () => {
    mockCreateOrganization.mockResolvedValue({
      ok: false,
      code: 'SLUG_TAKEN',
      error: 'Organization slug is already taken',
    });

    render(<CreateEventForm organizations={[]} showAiContextDisclosure={false} />);

    fireEvent.change(
      screen.getByPlaceholderText('pages.dashboardEvents.createEvent.organization.namePlaceholder'),
      {
        target: { value: 'TrailMX Org' },
      },
    );
    fireEvent.change(
      screen.getByPlaceholderText('pages.dashboardEvents.createEvent.organization.slugPlaceholder'),
      {
        target: { value: 'trailmx' },
      },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'pages.dashboardEvents.createEvent.steps.continue' }),
    );

    expect(
      await screen.findByText('pages.dashboardEvents.createEvent.organization.errors.slugTaken'),
    ).toBeInTheDocument();
  });

  it('submits the event step through the single server action and redirects on success', async () => {
    render(<CreateEventForm organizations={organizations} showAiContextDisclosure />);

    fireEvent.click(
      screen.getByRole('button', { name: 'pages.dashboardEvents.createEvent.steps.continue' }),
    );
    fireEvent.change(
      screen.getByPlaceholderText('pages.dashboardEvents.createEvent.event.seriesNamePlaceholder'),
      {
        target: { value: 'Valle Trail' },
      },
    );
    fireEvent.change(screen.getAllByPlaceholderText('2025')[0], {
      target: { value: '2027' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /pages.dashboardEvents.createEvent.event.aiContextTrigger/i,
      }),
    );
    fireEvent.change(
      screen.getByPlaceholderText('pages.dashboardEvents.createEvent.event.aiContextPlaceholder'),
      {
        target: { value: 'Premium trail weekend with family-friendly energy.' },
      },
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'pages.dashboardEvents.createEvent.submit' }),
    );

    await waitFor(() => {
      expect(mockCreateEventStepAction).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          organizerBrief: 'Premium trail weekend with family-friendly energy.',
          showAiContextDisclosure: true,
        }),
      );
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/dashboard/events/[eventId]/settings',
        params: { eventId: 'edition-1' },
        query: { wizard: '1' },
      });
    });
  });

  it('maps edition creation errors to localized organizer copy', async () => {
    mockCreateEventStepAction.mockResolvedValue({
      ok: false,
      error: 'SERVER_ERROR',
      message: 'LABEL_TAKEN',
    });

    render(<CreateEventForm organizations={organizations} showAiContextDisclosure={false} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'pages.dashboardEvents.createEvent.steps.continue' }),
    );
    fireEvent.change(
      screen.getByPlaceholderText('pages.dashboardEvents.createEvent.event.seriesNamePlaceholder'),
      {
        target: { value: 'Valle Trail' },
      },
    );
    fireEvent.change(screen.getAllByPlaceholderText('2025')[0], {
      target: { value: '2027' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'pages.dashboardEvents.createEvent.submit' }),
    );

    expect(
      await screen.findByText('pages.dashboardEvents.createEvent.event.errors.editionLabelTaken'),
    ).toBeInTheDocument();
  });

  it('does not submit organizer brief when the AI disclosure is disabled', async () => {
    render(<CreateEventForm organizations={organizations} showAiContextDisclosure={false} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'pages.dashboardEvents.createEvent.steps.continue' }),
    );
    fireEvent.change(
      screen.getByPlaceholderText('pages.dashboardEvents.createEvent.event.seriesNamePlaceholder'),
      {
        target: { value: 'Valle Trail' },
      },
    );
    fireEvent.change(screen.getAllByPlaceholderText('2025')[0], {
      target: { value: '2027' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'pages.dashboardEvents.createEvent.submit' }),
    );

    await waitFor(() => {
      expect(mockCreateEventStepAction).toHaveBeenCalledWith(
        expect.objectContaining({
          organizerBrief: '',
          showAiContextDisclosure: false,
        }),
      );
    });
  });
});

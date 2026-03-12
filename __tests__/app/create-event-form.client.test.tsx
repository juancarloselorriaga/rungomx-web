import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CreateEventForm } from '@/app/[locale]/(protected)/dashboard/events/new/create-event-form';

const mockPush = jest.fn();
const mockCreateOrganization = jest.fn();
const mockCreateEventSeries = jest.fn();
const mockCreateEventEdition = jest.fn();

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

jest.mock('@/lib/events/actions', () => ({
  checkSlugAvailability: jest.fn(),
  createEventSeries: (...args: unknown[]) => mockCreateEventSeries(...args),
  createEventEdition: (...args: unknown[]) => mockCreateEventEdition(...args),
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
    mockCreateEventSeries.mockReset();
    mockCreateEventEdition.mockReset();
    mockCreateOrganization.mockResolvedValue({
      ok: true,
      data: { id: 'org-2', name: 'New org', slug: 'new-org' },
    });
    mockCreateEventSeries.mockResolvedValue({
      ok: true,
      data: { id: 'series-1' },
    });
    mockCreateEventEdition.mockResolvedValue({
      ok: true,
      data: { id: 'edition-1' },
    });
  });

  it('shows description guidance and the Pro AI context disclosure on the event step', () => {
    render(<CreateEventForm organizations={organizations} showAiContextDisclosure />);

    fireEvent.click(screen.getByRole('button', { name: 'pages.dashboardEvents.createEvent.steps.continue' }));

    expect(screen.getByText('pages.dashboardEvents.createEvent.event.descriptionHelper')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pages.dashboardEvents.createEvent.event.aiContextTrigger/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /pages.dashboardEvents.createEvent.event.aiContextTrigger/i }));

    expect(screen.getByText('pages.dashboardEvents.createEvent.event.aiContextLabel')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('pages.dashboardEvents.createEvent.event.aiContextPlaceholder'),
    ).toBeInTheDocument();
    expect(screen.getByText('pages.dashboardEvents.createEvent.event.aiContextHelper')).toBeInTheDocument();
  });

  it('keeps the create form lightweight for non-Pro users', () => {
    render(<CreateEventForm organizations={organizations} showAiContextDisclosure={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'pages.dashboardEvents.createEvent.steps.continue' }));

    expect(screen.getByText('pages.dashboardEvents.createEvent.event.descriptionHelper')).toBeInTheDocument();
    expect(screen.queryByText('pages.dashboardEvents.createEvent.event.aiContextTrigger')).not.toBeInTheDocument();
    expect(screen.queryByText('pages.dashboardEvents.createEvent.event.aiContextLabel')).not.toBeInTheDocument();
  });

  it('maps organization creation errors to localized organizer copy', async () => {
    mockCreateOrganization.mockResolvedValue({
      ok: false,
      code: 'SLUG_TAKEN',
      error: 'Organization slug is already taken',
    });

    render(<CreateEventForm organizations={[]} showAiContextDisclosure={false} />);

    fireEvent.change(screen.getByPlaceholderText('pages.dashboardEvents.createEvent.organization.namePlaceholder'), {
      target: { value: 'TrailMX Org' },
    });
    fireEvent.change(screen.getByPlaceholderText('pages.dashboardEvents.createEvent.organization.slugPlaceholder'), {
      target: { value: 'trailmx' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'pages.dashboardEvents.createEvent.steps.continue' }));

    expect(await screen.findByText('pages.dashboardEvents.createEvent.organization.errors.slugTaken')).toBeInTheDocument();
  });

  it('submits the organizer brief when the Pro disclosure is used', async () => {
    render(<CreateEventForm organizations={organizations} showAiContextDisclosure />);

    fireEvent.click(screen.getByRole('button', { name: 'pages.dashboardEvents.createEvent.steps.continue' }));
    fireEvent.change(screen.getByPlaceholderText('pages.dashboardEvents.createEvent.event.seriesNamePlaceholder'), {
      target: { value: 'Valle Trail' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('2025')[0], {
      target: { value: '2027' },
    });
    fireEvent.click(screen.getByRole('button', { name: /pages.dashboardEvents.createEvent.event.aiContextTrigger/i }));
    fireEvent.change(screen.getByPlaceholderText('pages.dashboardEvents.createEvent.event.aiContextPlaceholder'), {
      target: { value: 'Premium trail weekend with family-friendly energy.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'pages.dashboardEvents.createEvent.submit' }));

    await waitFor(() => {
      expect(mockCreateEventEdition).toHaveBeenCalledWith(
        expect.objectContaining({
          organizerBrief: 'Premium trail weekend with family-friendly energy.',
        }),
      );
    });
  });

  it('maps edition creation errors to localized organizer copy', async () => {
    mockCreateEventEdition.mockResolvedValue({
      ok: false,
      code: 'LABEL_TAKEN',
      error: 'Edition label is already used in this series',
    });

    render(<CreateEventForm organizations={organizations} showAiContextDisclosure={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'pages.dashboardEvents.createEvent.steps.continue' }));
    fireEvent.change(screen.getByPlaceholderText('pages.dashboardEvents.createEvent.event.seriesNamePlaceholder'), {
      target: { value: 'Valle Trail' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('2025')[0], {
      target: { value: '2027' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'pages.dashboardEvents.createEvent.submit' }));

    expect(await screen.findByText('pages.dashboardEvents.createEvent.event.errors.editionLabelTaken')).toBeInTheDocument();
  });
});

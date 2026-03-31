type MockAuthContext = {
  user: { id: string };
  isInternal: boolean;
  permissions: {
    canManageEvents: boolean;
    canViewOrganizersDashboard: boolean;
  };
};

const defaultAuthContext: MockAuthContext = {
  user: { id: 'user-1' },
  isInternal: false,
  permissions: {
    canManageEvents: false,
    canViewOrganizersDashboard: true,
  },
};

const organizationId = '11111111-1111-4111-8111-111111111111';
const seriesId = '22222222-2222-4222-8222-222222222222';

const mockWithAuthenticatedUser = jest.fn();
const mockCreateEventSeries = jest.fn();
const mockCreateEventEdition = jest.fn();
const mockNormalizeEditionDateTimeForPersistence = jest.fn();

jest.mock('@/lib/auth/action-wrapper', () => ({
  withAuthenticatedUser:
    (options: { unauthenticated: () => unknown }) =>
    (handler: (ctx: MockAuthContext, ...args: unknown[]) => Promise<unknown>) =>
    async (...args: unknown[]) => {
      const next = mockWithAuthenticatedUser();
      if (next?.unauthenticated) return options.unauthenticated();
      return handler(next?.context ?? defaultAuthContext, ...args);
    },
}));

jest.mock('@/lib/events/actions', () => ({
  createEventSeries: (...args: unknown[]) => mockCreateEventSeries(...args),
  createEventEdition: (...args: unknown[]) => mockCreateEventEdition(...args),
}));

jest.mock('@/lib/events/datetime', () => ({
  normalizeEditionDateTimeForPersistence: (...args: unknown[]) =>
    mockNormalizeEditionDateTimeForPersistence(...args),
}));

const { createEventStepAction } =
  require('@/app/actions/events-create') as typeof import('@/app/actions/events-create');

describe('createEventStepAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWithAuthenticatedUser.mockReturnValue(null);
    mockNormalizeEditionDateTimeForPersistence.mockReturnValue('2027-01-01T07:00:00.000Z');
    mockCreateEventSeries.mockResolvedValue({ ok: true, data: { id: 'series-1' } });
    mockCreateEventEdition.mockResolvedValue({ ok: true, data: { id: 'edition-1' } });
  });

  it('returns unauthenticated when the auth wrapper denies access', async () => {
    mockWithAuthenticatedUser.mockReturnValue({ unauthenticated: true });

    await expect(createEventStepAction({})).resolves.toEqual({
      ok: false,
      error: 'UNAUTHENTICATED',
      message: 'UNAUTHENTICATED',
    });
  });

  it('returns forbidden when the user lacks organizer and staff event access', async () => {
    mockWithAuthenticatedUser.mockReturnValue({
      context: {
        ...defaultAuthContext,
        permissions: { canManageEvents: false, canViewOrganizersDashboard: false },
      },
    });

    await expect(
      createEventStepAction({
        organizationId,
        selectedSeriesId: seriesId,
        showNewSeries: false,
        sportType: 'trail_running',
        editionLabel: '2027',
        editionSlug: '2027',
        description: '',
        organizerBrief: '',
        startsAt: '',
        address: '',
        city: '',
        state: '',
        latitude: '',
        longitude: '',
        locationDisplay: '',
        showAiContextDisclosure: false,
      }),
    ).resolves.toEqual({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' });
  });

  it('returns invalid input when reusing a series without a selected series id', async () => {
    const result = await createEventStepAction({
      organizationId,
      showNewSeries: false,
      sportType: 'trail_running',
      editionLabel: '2027',
      editionSlug: '2027',
      description: '',
      organizerBrief: '',
      startsAt: '',
      address: '',
      city: '',
      state: '',
      latitude: '',
      longitude: '',
      locationDisplay: '',
      showAiContextDisclosure: false,
    });

    expect(result).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
      fieldErrors: { selectedSeriesId: ['SERIES_REQUIRED'] },
      message: 'VALIDATION_ERROR',
    });
  });

  it('creates an edition under an existing series without creating a new series', async () => {
    const result = await createEventStepAction({
      organizationId,
      selectedSeriesId: seriesId,
      showNewSeries: false,
      sportType: 'trail_running',
      editionLabel: '2027',
      editionSlug: '2027',
      description: '',
      organizerBrief: '',
      startsAt: '',
      address: '',
      city: '',
      state: '',
      latitude: '',
      longitude: '',
      locationDisplay: '',
      showAiContextDisclosure: false,
    });

    expect(result).toEqual({ ok: true, data: { eventId: 'edition-1' } });
    expect(mockCreateEventSeries).not.toHaveBeenCalled();
    expect(mockCreateEventEdition).toHaveBeenCalledWith(
      expect.objectContaining({
        seriesId,
        organizerBrief: undefined,
      }),
    );
  });

  it('creates a new series first when the form is in new-series mode', async () => {
    const result = await createEventStepAction({
      organizationId,
      selectedSeriesId: null,
      showNewSeries: true,
      seriesName: 'Valle Trail',
      seriesSlug: 'valle-trail',
      sportType: 'trail_running',
      editionLabel: '2027',
      editionSlug: '2027',
      description: '',
      organizerBrief: '',
      startsAt: '',
      address: '',
      city: '',
      state: '',
      latitude: '',
      longitude: '',
      locationDisplay: '',
      showAiContextDisclosure: false,
    });

    expect(result).toEqual({ ok: true, data: { eventId: 'edition-1' } });
    expect(mockCreateEventSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        name: 'Valle Trail',
        slug: 'valle-trail',
      }),
    );
    expect(mockCreateEventEdition).toHaveBeenCalledWith(
      expect.objectContaining({ seriesId: 'series-1' }),
    );
  });

  it('does not forward organizer brief when AI disclosure is disabled', async () => {
    await createEventStepAction({
      organizationId,
      selectedSeriesId: seriesId,
      showNewSeries: false,
      sportType: 'trail_running',
      editionLabel: '2027',
      editionSlug: '2027',
      description: '',
      organizerBrief: 'Should not be sent',
      startsAt: '',
      address: '',
      city: '',
      state: '',
      latitude: '',
      longitude: '',
      locationDisplay: '',
      showAiContextDisclosure: false,
    });

    expect(mockCreateEventEdition).toHaveBeenCalledWith(
      expect.objectContaining({ organizerBrief: undefined }),
    );
  });

  it('surfaces downstream pro-feature denial through the action result', async () => {
    mockCreateEventEdition.mockResolvedValue({
      ok: false,
      error: 'Feature locked',
      code: 'FORBIDDEN',
    });

    const result = await createEventStepAction({
      organizationId,
      selectedSeriesId: null,
      showNewSeries: true,
      seriesName: 'Valle Trail',
      seriesSlug: 'valle-trail',
      sportType: 'trail_running',
      editionLabel: '2027',
      editionSlug: '2027',
      description: '',
      organizerBrief: 'Premium trail weekend',
      startsAt: '',
      address: '',
      city: '',
      state: '',
      latitude: '',
      longitude: '',
      locationDisplay: '',
      showAiContextDisclosure: true,
    });

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' });
  });

  it('forwards a structured address to edition creation when location selection resolved it', async () => {
    await createEventStepAction({
      organizationId,
      selectedSeriesId: seriesId,
      showNewSeries: false,
      sportType: 'trail_running',
      editionLabel: '2027',
      editionSlug: '2027',
      description: '',
      organizerBrief: '',
      startsAt: '',
      address: 'Calle Ludwig Van Beethoven 5800, 45010 Zapopan, Jalisco, México',
      city: 'Zapopan',
      state: 'Jalisco',
      latitude: '20.67046657',
      longitude: '-103.43992534',
      locationDisplay: 'Parque Metropolitano de Guadalajara, Zapopan, Jalisco, México',
      showAiContextDisclosure: false,
    });

    expect(mockCreateEventEdition).toHaveBeenCalledWith(
      expect.objectContaining({
        address: 'Calle Ludwig Van Beethoven 5800, 45010 Zapopan, Jalisco, México',
      }),
    );
  });
});

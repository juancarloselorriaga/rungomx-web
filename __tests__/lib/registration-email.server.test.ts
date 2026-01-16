const mockSendEmail = jest.fn<Promise<unknown>, unknown[]>();
const mockGetMyRegistrationDetail = jest.fn();
const mockGetPathname = jest.fn();

jest.mock('@/config/url', () => ({
  siteUrl: 'http://localhost:3000',
}));

jest.mock('@/i18n/routing', () => ({
  DEFAULT_TIMEZONE: 'America/Mexico_City',
  routing: {
    locales: ['en', 'es'] as const,
    defaultLocale: 'en',
    localePrefix: 'as-needed',
    pathnames: {},
  },
}));

jest.mock('@/i18n/navigation', () => ({
  getPathname: (...args: unknown[]) => mockGetPathname(...args),
}));

jest.mock('@/lib/email', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

jest.mock('@/lib/events/queries', () => ({
  getMyRegistrationDetail: (...args: unknown[]) => mockGetMyRegistrationDetail(...args),
}));

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(() => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return `[${key}]:${JSON.stringify(params)}`;
    }
    return `[${key}]`;
  }),
}));

import { sendRegistrationCompletionEmail } from '@/lib/events/registration-email';
import { formatRegistrationTicketCode } from '@/lib/events/tickets';

const registrationId = '123e4567-e89b-12d3-a456-426614174000';

const mockDetail = {
  registration: {
    id: registrationId,
    status: 'confirmed',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    expiresAt: null,
    basePriceCents: 5000,
    feesCents: 500,
    taxCents: 0,
    totalCents: 5500,
  },
  event: {
    seriesName: 'Test Series',
    seriesSlug: 'test-series',
    editionLabel: '2026',
    editionSlug: '2026',
    startsAt: new Date('2026-01-10T15:00:00Z'),
    endsAt: null,
    timezone: 'America/Mexico_City',
    locationDisplay: 'Mexico City, MX',
    address: null,
    city: 'Mexico City',
    state: 'CDMX',
    country: 'MX',
    externalUrl: null,
  },
  distance: {
    id: 'distance-1',
    label: '10K',
  },
  registrant: {
    profileSnapshot: {
      firstName: 'Ana',
      lastName: 'Gomez',
      email: 'ana@example.com',
    },
  },
  waiverAcceptances: [],
};

describe('Registration Email Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMyRegistrationDetail.mockResolvedValue(mockDetail);
    mockGetPathname.mockReturnValue('/dashboard/my-registrations/123');
    mockSendEmail.mockResolvedValue({});
  });

  it('sends a confirmation email with ticket code', async () => {
    await sendRegistrationCompletionEmail({
      registrationId,
      userId: 'user-1',
      status: 'confirmed',
      userEmail: 'ana@example.com',
      userName: 'Ana Gomez',
      locale: 'en',
    });

    const ticketCode = formatRegistrationTicketCode(registrationId);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: { email: 'ana@example.com', name: 'Ana Gomez' },
        subject: expect.stringContaining('[subject]'),
        htmlContent: expect.stringContaining(ticketCode),
      }),
    );
  });

  it('sends a payment pending email with pay CTA', async () => {
    await sendRegistrationCompletionEmail({
      registrationId,
      userId: 'user-1',
      status: 'payment_pending',
      userEmail: 'ana@example.com',
      userName: 'Ana Gomez',
      locale: 'en',
    });

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        htmlContent: expect.stringContaining('[ctaLabel]'),
      }),
    );
  });

  it('skips sending when registration is not found', async () => {
    mockGetMyRegistrationDetail.mockResolvedValueOnce(null);

    await sendRegistrationCompletionEmail({
      registrationId,
      userId: 'user-1',
      status: 'confirmed',
      userEmail: 'ana@example.com',
      userName: 'Ana Gomez',
      locale: 'en',
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

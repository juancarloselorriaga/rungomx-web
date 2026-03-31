import type { ReactNode } from 'react';

import {
  buildEventEditionPayload,
  getVisiblePublishDisabledReasons,
} from '@/app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-settings-form';
import { shouldAutoOpenDistanceComposer } from '@/app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-settings-surface';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

jest.mock('next/dynamic', () => () => {
  const MockDynamicComponent = () => null;
  MockDynamicComponent.displayName = 'MockDynamicComponent';
  return MockDynamicComponent;
});

jest.mock('next/image', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@vercel/blob/client', () => ({
  upload: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    refresh: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock('@/lib/events/actions', () => ({
  updateEventEdition: jest.fn(),
  updateEventVisibility: jest.fn(),
  setRegistrationPaused: jest.fn(),
  createDistance: jest.fn(),
  updateDistance: jest.fn(),
  deleteDistance: jest.fn(),
  updateDistancePrice: jest.fn(),
  checkSlugAvailability: jest.fn(),
  confirmEventMediaUpload: jest.fn(),
  updateEventCapacitySettings: jest.fn(),
}));

jest.mock('@/components/ui/button', () => ({
  Button: () => null,
}));

jest.mock('@/components/ui/date-picker', () => ({
  DatePicker: () => null,
}));

jest.mock('@/components/ui/delete-confirmation-dialog', () => ({
  DeleteConfirmationDialog: () => null,
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children?: ReactNode }) => children ?? null,
  DialogContent: ({ children }: { children?: ReactNode }) => children ?? null,
  DialogDescription: ({ children }: { children?: ReactNode }) => children ?? null,
  DialogFooter: ({ children }: { children?: ReactNode }) => children ?? null,
  DialogHeader: ({ children }: { children?: ReactNode }) => children ?? null,
  DialogTitle: ({ children }: { children?: ReactNode }) => children ?? null,
}));

jest.mock('@/components/ui/form-field', () => ({
  FormField: ({ children }: { children?: ReactNode }) => children ?? null,
}));

jest.mock('@/components/ui/markdown-field', () => ({
  MarkdownField: () => null,
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: () => null,
}));

jest.mock('@/components/ui/icon-button', () => ({
  IconButton: () => null,
}));

jest.mock('@/lib/forms', () => ({
  Form: ({ children }: { children?: ReactNode }) => children ?? null,
  FormError: () => null,
  useForm: jest.fn(),
}));

describe('event settings distance surface behavior', () => {
  it('only auto-opens the distance composer in the wizard distance surface', () => {
    expect(shouldAutoOpenDistanceComposer('wizard-distances', 0)).toBe(true);
    expect(shouldAutoOpenDistanceComposer('full', 0)).toBe(false);
    expect(shouldAutoOpenDistanceComposer('wizard-basics', 0)).toBe(false);
    expect(shouldAutoOpenDistanceComposer('wizard-distances', 2)).toBe(false);
  });
});

describe('event settings payload shaping', () => {
  const baseValues = {
    editionLabel: '2026',
    slug: 'trail-del-sol-2026',
    description: ' Sunrise start with real schedule already set. ',
    timezone: 'America/Mexico_City',
    startsAt: '2026-10-18',
    startsAtTime: '07:00',
    endsAt: '2026-10-19',
    city: 'Monterrey',
    state: 'Nuevo Leon',
    locationDisplay: 'Parque Fundidora',
    address: 'Avenida Fundidora 501',
    latitude: '25.678',
    longitude: '-100.286',
    externalUrl: 'https://example.com/event',
    registrationOpensAt: '2026-05-01T06:30',
    registrationClosesAt: '2026-10-10T23:15',
  };

  it('omits schedule fields when the registration wizard saves', () => {
    const payload = buildEventEditionPayload({
      editionId: 'evt-1',
      surface: 'wizard-registration',
      values: baseValues,
    });

    expect(payload).not.toHaveProperty('startsAt');
    expect(payload).not.toHaveProperty('endsAt');
  });

  it('still sends schedule fields on schedule-editing surfaces', () => {
    for (const surface of ['full', 'wizard-basics'] as const) {
      const payload = buildEventEditionPayload({
        editionId: 'evt-1',
        surface,
        values: baseValues,
      });

      expect(payload.startsAt).toBe('2026-10-18T13:00:00.000Z');
      expect(payload.endsAt).toBe('2026-10-19T06:00:00.000Z');
    }
  });

  it('keeps registration window updates while protecting an already-correct schedule from wizard registration saves', () => {
    const payload = buildEventEditionPayload({
      editionId: 'evt-1',
      surface: 'wizard-registration',
      values: baseValues,
    });

    expect(payload).toEqual(
      expect.objectContaining({
        editionId: 'evt-1',
        registrationOpensAt: '2026-05-01T12:30:00.000Z',
        registrationClosesAt: '2026-10-11T05:15:00.000Z',
      }),
    );
    expect(payload).not.toHaveProperty('startsAt');
    expect(payload).not.toHaveProperty('endsAt');
  });

  it('serializes registration date-only boundaries in the event timezone without previous-day drift', () => {
    const payload = buildEventEditionPayload({
      editionId: 'evt-1',
      surface: 'wizard-registration',
      values: {
        ...baseValues,
        registrationOpensAt: '2026-09-01T00:00',
        registrationClosesAt: '2026-09-01T23:59',
      },
    });

    expect(payload.registrationOpensAt).toBe('2026-09-01T06:00:00.000Z');
    expect(payload.registrationClosesAt).toBe('2026-09-02T05:59:00.000Z');
  });

  it('preserves the resolved structured address fields for event settings edits', () => {
    const payload = buildEventEditionPayload({
      editionId: 'evt-1',
      surface: 'full',
      values: {
        ...baseValues,
        address: 'Calle Ludwig Van Beethoven 5800, 45010 Zapopan, Jalisco, México',
        city: 'Zapopan',
        state: 'Jalisco',
        locationDisplay: 'Parque Metropolitano de Guadalajara, Zapopan, Jalisco, México',
        latitude: '20.67046657',
        longitude: '-103.43992534',
      },
    });

    expect(payload).toEqual(
      expect.objectContaining({
        address: 'Calle Ludwig Van Beethoven 5800, 45010 Zapopan, Jalisco, México',
        city: 'Zapopan',
        state: 'Jalisco',
        locationDisplay: 'Parque Metropolitano de Guadalajara, Zapopan, Jalisco, México',
        latitude: '20.67046657',
        longitude: '-103.43992534',
      }),
    );
  });
});

describe('publish disabled hint helpers', () => {
  it('deduplicates reasons, trims blanks, and caps the visible list', () => {
    expect(
      getVisiblePublishDisabledReasons([
        { label: ' Add event date ', href: '/dashboard/events/evt-1/settings#details' },
        { label: '', href: '/dashboard/events/evt-1/settings' },
        { label: 'Add event date', href: '/dashboard/events/evt-1/settings#details' },
        { label: 'Confirm venue', href: '/dashboard/events/evt-1/settings#location' },
        { label: 'Add pricing', href: '/dashboard/events/evt-1/pricing' },
        { label: 'Extra hidden reason', href: '/dashboard/events/evt-1/website' },
      ]),
    ).toEqual([
      { label: 'Add event date', href: '/dashboard/events/evt-1/settings#details' },
      { label: 'Confirm venue', href: '/dashboard/events/evt-1/settings#location' },
      { label: 'Add pricing', href: '/dashboard/events/evt-1/pricing' },
    ]);
  });
});

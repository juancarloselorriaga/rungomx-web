jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(),
}));

import { buildEventSettingsMetadata } from '@/app/[locale]/(protected)/dashboard/events/[eventId]/settings/settings-metadata';
import { getTranslations } from 'next-intl/server';

const mockGetTranslations = getTranslations as jest.MockedFunction<typeof getTranslations>;

describe('event settings metadata', () => {
  beforeEach(() => {
    mockGetTranslations.mockReset();
    mockGetTranslations.mockImplementation(async (opts?: { locale?: string }) => {
      const locale = opts?.locale ?? 'en';
      if (locale === 'es') {
        return ((key: string) => {
          if (key === 'title') return 'Configuración del Evento';
          if (key === 'description') return 'Configura los detalles, visibilidad, distancias y ajustes de inscripción de tu evento.';
          return key;
        }) as never;
      }

      return ((key: string) => {
        if (key === 'title') return 'Event Settings';
        if (key === 'description') return 'Configure your event details, visibility, distances, and registration settings.';
        return key;
      }) as never;
    });
  });

  it('localizes the fallback metadata when the event does not exist', async () => {
    const metadata = await buildEventSettingsMetadata('es', null);

    expect(metadata.title).toBe('Configuración del Evento | RunGoMX');
    expect(metadata.description).toBe(
      'Configura los detalles, visibilidad, distancias y ajustes de inscripción de tu evento.',
    );
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('localizes the event-specific metadata title', async () => {
    const metadata = await buildEventSettingsMetadata('en', {
      seriesName: 'Nevado Valle de Bravo Trail',
      editionLabel: '2026',
    });

    expect(metadata.title).toBe('Event Settings - Nevado Valle de Bravo Trail 2026 | RunGoMX');
    expect(metadata.description).toBe(
      'Configure your event details, visibility, distances, and registration settings.',
    );
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

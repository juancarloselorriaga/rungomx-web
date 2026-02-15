import { toInternalPathFromPathnames } from '@/proxy/localization-pathnames';

describe('proxy/localization-pathnames toInternalPathFromPathnames', () => {
  const pathnames = {
    '/dashboard/events/new': '/tablero/eventos/nuevo',
    '/dashboard/events/[eventId]': '/tablero/eventos/[eventId]',
  } as const;

  it('maps default-locale static routes before dynamic ones (nuevo vs [eventId])', () => {
    expect(toInternalPathFromPathnames('/tablero/eventos/nuevo', 'es', pathnames)).toBe(
      '/dashboard/events/new',
    );
  });

  it('maps default-locale dynamic event detail routes correctly', () => {
    expect(toInternalPathFromPathnames('/tablero/eventos/1234', 'es', pathnames)).toBe(
      '/dashboard/events/1234',
    );
  });
});


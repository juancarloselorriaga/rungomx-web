/** @jest-environment node */

jest.mock('next-intl/server', () => ({
  getRequestConfig:
    (callback: (context: unknown) => Promise<unknown> | unknown) => (context: unknown) =>
      callback(context),
}));

jest.mock('next-intl', () => ({
  hasLocale: jest.fn((locales: string[], locale: string) => locales.includes(locale)),
}));

jest.mock('@/i18n/utils', () => ({
  getRequestPathname: jest.fn(),
  getStoredRoutePathname: jest.fn(),
  loadRouteMessages: jest.fn(),
  loadMessages: jest.fn(),
}));

jest.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['en', 'es'],
    defaultLocale: 'en',
    localePrefix: 'as-needed',
    pathnames: {},
  },
}));

import requestConfig from '@/i18n/request';
import {
  getRequestPathname,
  getStoredRoutePathname,
  loadMessages,
  loadRouteMessages,
} from '@/i18n/utils';

const mockedLoadRouteMessages = loadRouteMessages as jest.Mock;
const mockedLoadMessages = loadMessages as jest.Mock;
const mockedGetRequestPathname = getRequestPathname as jest.Mock;
const mockedGetStoredRoutePathname = getStoredRoutePathname as jest.Mock;

describe('i18n request config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefers route-scoped loading when a pathname was already remembered', async () => {
    mockedGetStoredRoutePathname.mockReturnValue('/about');
    mockedLoadRouteMessages.mockResolvedValue({ route: true });

    const result = await requestConfig({ requestLocale: Promise.resolve('es') });

    expect(mockedLoadRouteMessages).toHaveBeenCalledWith('es', '/about');
    expect(mockedGetRequestPathname).not.toHaveBeenCalled();
    expect(mockedLoadMessages).not.toHaveBeenCalled();
    expect(result.messages).toEqual({ route: true });
  });

  it('falls back to full bundle when no pathname context is stored', async () => {
    mockedGetStoredRoutePathname.mockReturnValue(undefined);
    mockedGetRequestPathname.mockResolvedValue('/fallback');
    mockedLoadMessages.mockResolvedValue({ full: true });

    const result = await requestConfig({ requestLocale: Promise.resolve('en') });

    expect(mockedLoadRouteMessages).not.toHaveBeenCalled();
    expect(mockedGetRequestPathname).toHaveBeenCalled();
    expect(mockedLoadMessages).toHaveBeenCalledWith('en');
    expect(result.messages).toEqual({ full: true });
  });
});

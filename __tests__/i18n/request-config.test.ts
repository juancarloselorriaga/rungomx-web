/** @jest-environment node */

jest.mock('next-intl/server', () => ({
  getRequestConfig: (callback: (context: any) => Promise<any> | any) => (context: any) =>
    callback(context),
}));

jest.mock('next-intl', () => ({
  hasLocale: jest.fn((locales: string[], locale: string) => locales.includes(locale)),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

jest.mock('@/i18n/utils', () => ({
  getRequestPathname: jest.fn(),
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
import { getRequestPathname, loadMessages, loadRouteMessages } from '@/i18n/utils';
import { headers } from 'next/headers';

const mockedHeaders = headers as jest.Mock;
const mockedLoadRouteMessages = loadRouteMessages as jest.Mock;
const mockedLoadMessages = loadMessages as jest.Mock;
const mockedGetRequestPathname = getRequestPathname as jest.Mock;

describe('i18n request config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefers route-scoped loading when header path is provided', async () => {
    mockedHeaders.mockImplementation(() => ({
      get: (key: string) => (key === 'x-pathname' ? '/about' : undefined),
    }));

    mockedLoadRouteMessages.mockResolvedValue({ route: true });

    const result = await requestConfig({ requestLocale: Promise.resolve('es') });

    expect(mockedLoadRouteMessages).toHaveBeenCalledWith('es', '/about');
    expect(mockedLoadMessages).not.toHaveBeenCalled();
    expect(result.messages).toEqual({ route: true });
  });

  it('falls back to full bundle when request headers are missing', async () => {
    mockedHeaders.mockImplementation(() => ({
      get: () => undefined,
    }));

    mockedGetRequestPathname.mockResolvedValue('/fallback');
    mockedLoadMessages.mockResolvedValue({ full: true });

    const result = await requestConfig({ requestLocale: Promise.resolve('en') });

    expect(mockedLoadRouteMessages).not.toHaveBeenCalled();
    expect(mockedGetRequestPathname).toHaveBeenCalled();
    expect(mockedLoadMessages).toHaveBeenCalledWith('en');
    expect(result.messages).toEqual({ full: true });
  });
});

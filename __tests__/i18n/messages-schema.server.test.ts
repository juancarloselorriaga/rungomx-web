jest.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['en', 'es'] as const,
    defaultLocale: 'en',
    localePrefix: 'as-needed',
    pathnames: {},
  },
  AppLocale: undefined as unknown as string,
}));

import type { Messages } from '@/i18n/types';
import { validateMessages } from '@/i18n/utils';

let enMessages: Messages;

beforeAll(async () => {
  const { loadMessages } = await import('@/i18n/utils');
  enMessages = await loadMessages('en');
});

describe('messages schema validation', () => {
  it('accepts valid dictionaries', () => {
    expect(validateMessages('en', enMessages)).toEqual(enMessages);
  });

  it('fails when required keys are missing', () => {
    const invalid = {
      ...enMessages,
      common: { ...enMessages.common },
    };
    delete (invalid.common as Record<string, unknown>).loading;

    expect(() => validateMessages('en', invalid)).toThrow(/common\.loading/);
  });

  it('fails when unexpected keys are present', () => {
    const invalid = {
      ...enMessages,
      common: { ...enMessages.common, extra: 'nope' },
    };

    expect(() => validateMessages('en', invalid)).toThrow(/extra/);
  });
});

describe('namespaced dictionaries', () => {
  it('exposes navigation labels under the navigation namespace', () => {
    expect(enMessages.navigation).toMatchObject({
      home: expect.any(String),
      about: expect.any(String),
      contact: expect.any(String),
      events: expect.any(String),
      news: expect.any(String),
      results: expect.any(String),
      help: expect.any(String),
      dashboard: expect.any(String),
      profile: expect.any(String),
      settings: expect.any(String),
    });
  });

  it('moves shared component copy under components namespaces', () => {
    expect(enMessages.components.localeSwitcher).toMatchObject({
      label: expect.any(String),
      locale: expect.any(String),
    });
  });
});

describe('loadMessages', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('validates imported dictionaries during load', async () => {
    jest.doMock('@/messages/common/en.json', () => ({
      __esModule: true,
      default: { loading: 'ok' },
    }));

    const { loadMessages: mockedLoadMessages } = await import('@/i18n/utils');

    await expect(mockedLoadMessages('en')).rejects.toThrow(/Invalid messages/);

    jest.unmock('@/messages/common/en.json');
  });

  it('returns validated messages when schema matches', async () => {
    jest.unmock('@/messages/common/en.json');
    jest.resetModules();
    const { loadMessages: realLoadMessages } = await import('@/i18n/utils');

    await expect(realLoadMessages('en')).resolves.toEqual(enMessages);
  });
});

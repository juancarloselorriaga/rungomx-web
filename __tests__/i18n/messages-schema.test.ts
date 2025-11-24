jest.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['en', 'es'] as const,
    defaultLocale: 'en',
    localePrefix: 'as-needed',
    pathnames: {},
  },
  AppLocale: undefined as unknown as string,
}));

import enMessages from '@/messages/en.json';
import { validateMessages } from '@/i18n/utils';

describe('messages schema validation', () => {
  it('accepts valid dictionaries', () => {
    expect(validateMessages('en', enMessages)).toEqual(enMessages);
  });

  it('fails when required keys are missing', () => {
    const invalid = {
      ...enMessages,
      Common: { ...enMessages.Common },
    };
    delete (invalid.Common as Record<string, string>).loading;

    expect(() => validateMessages('en', invalid)).toThrow(/Common\.loading/);
  });

  it('fails when unexpected keys are present', () => {
    const invalid = {
      ...enMessages,
      Common: { ...enMessages.Common, extra: 'nope' },
    };

    expect(() => validateMessages('en', invalid)).toThrow(/extra/);
  });
});

describe('loadMessages', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('validates imported dictionaries during load', async () => {
    jest.doMock('@/messages/en.json', () => ({
      __esModule: true,
      default: { Common: { loading: 'ok' } },
    }));

    const { loadMessages: mockedLoadMessages } = await import('@/i18n/utils');

    await expect(mockedLoadMessages('en')).rejects.toThrow(/Invalid messages/);

    jest.unmock('@/messages/en.json');
  });

  it('returns validated messages when schema matches', async () => {
    jest.unmock('@/messages/en.json');
    jest.resetModules();
    const { loadMessages: realLoadMessages } = await import('@/i18n/utils');

    await expect(realLoadMessages('en')).resolves.toEqual(enMessages);
  });
});

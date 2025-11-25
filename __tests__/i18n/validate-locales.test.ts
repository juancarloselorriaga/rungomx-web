import { compareLocaleGroup, validateLocaleGroups } from '@/scripts/validate-locales';

const baseUiMessages = {
  common: {
    loading: 'Loading',
    nested: {
      value: 'exists',
    },
  },
};

const buildUiGroup = (spanishMessages: Record<string, unknown>) => ({
  category: 'UI messages',
  entries: [
    { locale: 'en', filePath: 'messages/en/*', data: baseUiMessages },
    { locale: 'es', filePath: 'messages/es/*', data: spanishMessages },
  ],
});

describe('compareLocaleGroup', () => {
  it('returns no issues when key sets match', () => {
    const issues = compareLocaleGroup(buildUiGroup(baseUiMessages));
    expect(issues).toHaveLength(0);
  });

  it('reports missing keys relative to the reference locale', () => {
    const spanish = {
      common: {
        loading: 'Cargando',
        nested: {},
      },
    };

    const issues = compareLocaleGroup(buildUiGroup(spanish));

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      type: 'missing',
      keyPath: 'common.nested.value',
      locale: 'es',
      referenceLocale: 'en',
      category: 'UI messages',
    });
  });

  it('reports extra keys relative to the reference locale', () => {
    const spanish = {
      common: {
        loading: 'Cargando',
        nested: {
          value: 'valor',
          extra: 'extra',
        },
      },
    };

    const issues = compareLocaleGroup(buildUiGroup(spanish));

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      type: 'extra',
      keyPath: 'common.nested.extra',
      locale: 'es',
      referenceLocale: 'en',
      category: 'UI messages',
    });
  });
});

describe('validateLocaleGroups', () => {
  it('aggregates issues across groups', () => {
    const uiGroup = buildUiGroup(baseUiMessages);
    const metadataGroup = {
      category: 'Metadata messages',
      entries: [
        {
          locale: 'en',
          filePath: 'messages/metadata/en.json',
          data: { SEO: { title: 'Title' } },
        },
        {
          locale: 'es',
          filePath: 'messages/metadata/es.json',
          data: { SEO: {} },
        },
      ],
    };

    const issues = validateLocaleGroups([uiGroup, metadataGroup]);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      keyPath: 'SEO.title',
      category: 'Metadata messages',
      locale: 'es',
    });
  });
});

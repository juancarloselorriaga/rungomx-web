import fs from 'fs';
import path from 'path';

type LocaleEntry = {
  locale: string;
  filePath: string;
  data: unknown;
};

type LocaleGroup = {
  category: string;
  entries: LocaleEntry[];
};

export type ParityIssue = {
  category: string;
  type: 'missing' | 'extra';
  keyPath: string;
  locale: string;
  referenceLocale: string;
  filePath: string;
};

const defaultIgnore = new Set<string>();

const readJson = (relativePath: string) => {
  const absolutePath = path.join(process.cwd(), relativePath);
  const fileContent = fs.readFileSync(absolutePath, 'utf8');
  return { filePath: relativePath, data: JSON.parse(fileContent) };
};

export const collectKeyPaths = (value: unknown, prefix = ''): Set<string> => {
  const paths = new Set<string>();

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value).forEach(([key, child]) => {
      const nextPath = prefix ? `${prefix}.${key}` : key;
      paths.add(nextPath);
      collectKeyPaths(child, nextPath).forEach((childPath) => paths.add(childPath));
    });
  }

  return paths;
};

const filterIgnored = (paths: Set<string>, ignored: Set<string>) => {
  if (!ignored.size) return paths;
  const filtered = new Set<string>();
  paths.forEach((pathKey) => {
    if (!ignored.has(pathKey)) filtered.add(pathKey);
  });
  return filtered;
};

const diffKeySets = (reference: Set<string>, candidate: Set<string>) => {
  const missing = [...reference].filter((key) => !candidate.has(key));
  const extra = [...candidate].filter((key) => !reference.has(key));
  return { missing, extra };
};

const namespacePaths = {
  roots: {
    common: 'messages/common',
    navigation: 'messages/navigation',
    auth: 'messages/auth',
    errors: 'messages/errors',
  },
  components: {
    footer: 'messages/components/footer',
    themeSwitcher: 'messages/components/theme-switcher',
    errorBoundary: 'messages/components/error-boundary',
    localeSwitcher: 'messages/components/locale-switcher',
  },
  pages: {
    home: 'messages/pages/home',
    about: 'messages/pages/about',
    contact: 'messages/pages/contact',
    events: 'messages/pages/events',
    news: 'messages/pages/news',
    results: 'messages/pages/results',
    help: 'messages/pages/help',
    dashboard: 'messages/pages/dashboard',
    profile: 'messages/pages/profile',
    settings: 'messages/pages/settings',
    team: 'messages/pages/team',
    signIn: 'messages/pages/sign-in',
    signUp: 'messages/pages/sign-up',
  },
} as const;

const readNamespace = (locale: string, basePath: string) =>
  readJson(`${basePath}/${locale}.json`).data;

const buildNamespaceGroup = <const TPaths extends Record<string, string>>(
  locale: string,
  paths: TPaths
) =>
  Object.fromEntries(
    Object.entries(paths).map(([key, basePath]) => [key, readNamespace(locale, basePath)])
  ) as { [K in keyof TPaths]: unknown };

const buildUiMessages = (locale: string) => ({
  ...buildNamespaceGroup(locale, namespacePaths.roots),
  components: buildNamespaceGroup(locale, namespacePaths.components),
  pages: buildNamespaceGroup(locale, namespacePaths.pages),
});

export const compareLocaleGroup = (
  group: LocaleGroup,
  ignored: Set<string> = defaultIgnore
): ParityIssue[] => {
  if (!group.entries.length) return [];

  const [reference, ...rest] = group.entries;
  const referenceKeys = filterIgnored(collectKeyPaths(reference.data), ignored);

  return rest.flatMap((entry) => {
    const candidateKeys = filterIgnored(collectKeyPaths(entry.data), ignored);
    const { missing, extra } = diffKeySets(referenceKeys, candidateKeys);

    const missingIssues: ParityIssue[] = missing.map((keyPath) => ({
      category: group.category,
      type: 'missing',
      keyPath,
      locale: entry.locale,
      referenceLocale: reference.locale,
      filePath: entry.filePath,
    }));

    const extraIssues: ParityIssue[] = extra.map((keyPath) => ({
      category: group.category,
      type: 'extra',
      keyPath,
      locale: entry.locale,
      referenceLocale: reference.locale,
      filePath: entry.filePath,
    }));

    return [...missingIssues, ...extraIssues];
  });
};

export const validateLocaleGroups = (
  groups: LocaleGroup[],
  ignored: Set<string> = defaultIgnore
): ParityIssue[] =>
  groups.flatMap((group) => {
    return compareLocaleGroup(group, ignored);
  });

const buildLocaleGroups = (): LocaleGroup[] => {
  const uiLocales: LocaleEntry[] = ['en', 'es'].map((locale) => ({
    locale,
    filePath: `messages/${locale}/*`,
    data: buildUiMessages(locale),
  }));

  const metadataLocales: LocaleEntry[] = ['en', 'es'].map((locale) => {
    const { filePath, data } = readJson(`messages/metadata/${locale}.json`);
    return { locale, filePath, data };
  });

  return [
    { category: 'UI messages', entries: uiLocales },
    { category: 'Metadata messages', entries: metadataLocales },
  ];
};

const formatIssue = (issue: ParityIssue) =>
  `[${issue.category}] ${issue.locale} has ${issue.type} key "${issue.keyPath}" compared to ${issue.referenceLocale} (${issue.filePath})`;

const run = () => {
  const groups = buildLocaleGroups();
  const issues = validateLocaleGroups(groups);

  if (!issues.length) {
    console.log('Locale parity check passed: UI and metadata dictionaries are aligned across locales.');
    return;
  }

  console.error('Locale parity check failed:');
  issues
    .slice()
    .sort((a, b) => a.keyPath.localeCompare(b.keyPath))
    .forEach((issue) => console.error(`- ${formatIssue(issue)}`));
  process.exitCode = 1;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}

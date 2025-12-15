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

/**
 * Auto-discover namespace paths from the filesystem.
 * This eliminates the need to manually register new namespaces.
 */
function discoverNamespacePaths() {
  const messagesDir = path.join(process.cwd(), 'messages');
  const pagesDir = path.join(messagesDir, 'pages');
  const componentsDir = path.join(messagesDir, 'components');

  // Root namespaces (always present)
  const roots: Record<string, string> = {
    common: 'messages/common',
    navigation: 'messages/navigation',
    auth: 'messages/auth',
    errors: 'messages/errors',
  };

  // Auto-discover component namespaces
  const components: Record<string, string> = {};
  if (fs.existsSync(componentsDir)) {
    const entries = fs.readdirSync(componentsDir);
    for (const entry of entries) {
      const fullPath = path.join(componentsDir, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        components[entry] = `messages/components/${entry}`;
      }
    }
  }

  // Auto-discover page namespaces
  const pages: Record<string, string> = {};
  if (fs.existsSync(pagesDir)) {
    const entries = fs.readdirSync(pagesDir);
    for (const entry of entries) {
      const fullPath = path.join(pagesDir, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        pages[entry] = `messages/pages/${entry}`;
      }
    }
  }

  return { roots, components, pages };
}

const namespacePaths = discoverNamespacePaths();

const readNamespace = (locale: string, basePath: string) =>
  readJson(`${basePath}/${locale}.json`).data;

const buildNamespaceGroup = <const TPaths extends Record<string, string>>(
  locale: string,
  paths: TPaths,
) =>
  Object.fromEntries(
    Object.entries(paths).map(([key, basePath]) => [key, readNamespace(locale, basePath)]),
  ) as { [K in keyof TPaths]: unknown };

const buildUiMessages = (locale: string) => ({
  ...buildNamespaceGroup(locale, namespacePaths.roots),
  components: buildNamespaceGroup(locale, namespacePaths.components),
  pages: buildNamespaceGroup(locale, namespacePaths.pages),
});

export const compareLocaleGroup = (
  group: LocaleGroup,
  ignored: Set<string> = defaultIgnore,
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
  ignored: Set<string> = defaultIgnore,
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

// Helper function for formatting issues (currently unused but kept for reference)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const formatIssue = (issue: ParityIssue) => {
  const symbol = issue.type === 'missing' ? '❌' : '⚠️ ';
  const action =
    issue.type === 'missing'
      ? `Add key "${issue.keyPath}" to ${issue.locale}`
      : `Remove key "${issue.keyPath}" from ${issue.locale}`;
  return `${symbol} [${issue.category}] ${action} (${issue.filePath})`;
};

const run = () => {
  const groups = buildLocaleGroups();
  const issues = validateLocaleGroups(groups);

  if (!issues.length) {
    console.log('✅ Locale parity check passed: All locales are in sync!\n');
    return;
  }

  console.error('\n❌ Locale parity check failed:\n');

  // Group issues by file for better readability
  const issuesByFile = new Map<string, ParityIssue[]>();
  issues.forEach((issue) => {
    const existing = issuesByFile.get(issue.filePath) || [];
    existing.push(issue);
    issuesByFile.set(issue.filePath, existing);
  });

  // Display grouped by file
  issuesByFile.forEach((fileIssues, filePath) => {
    console.error(`\n📁 ${filePath}:`);
    fileIssues
      .sort((a, b) => a.keyPath.localeCompare(b.keyPath))
      .forEach((issue) => {
        const action =
          issue.type === 'missing'
            ? `Missing key: "${issue.keyPath}"`
            : `Extra key: "${issue.keyPath}"`;
        console.error(`   ${action}`);
      });
  });

  console.error(
    '\n💡 Fix these issues by updating the JSON files to match the reference locale (en).\n',
  );
  console.error(`   Total issues: ${issues.length}\n`);

  process.exitCode = 1;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}

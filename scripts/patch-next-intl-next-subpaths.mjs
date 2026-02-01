import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);

const REPLACEMENTS = [
  ['from"next/navigation"', 'from"next/navigation.js"'],
  ['from"next/link"', 'from"next/link.js"'],
  ['from"next/server"', 'from"next/server.js"'],
  ['from"next/headers"', 'from"next/headers.js"'],
];

async function patchFile(filePath) {
  const before = await readFile(filePath, 'utf8');
  let after = before;

  for (const [from, to] of REPLACEMENTS) {
    after = after.split(from).join(to);
  }

  if (after === before) return false;
  await writeFile(filePath, after, 'utf8');
  return true;
}

async function main() {
  const entryPath = require.resolve('next-intl');

  // Node v25 enforces package exports, and `next-intl/package.json` may not be
  // resolvable. Walk up from the resolved entry until we find the actual
  // package root.
  let pkgDir = dirname(entryPath);
  while (!existsSync(resolve(pkgDir, 'package.json'))) {
    const parent = dirname(pkgDir);
    if (parent === pkgDir) {
      throw new Error(`Could not locate next-intl package root from: ${entryPath}`);
    }
    pkgDir = parent;
  }

  // Keep this list intentionally tight: only files where we observed Node ESM
  // failing to resolve `next/*` subpath imports (Node v25 requires explicit .js).
  const targetFiles = [
    resolve(pkgDir, 'dist/esm/production/middleware/middleware.js'),
    resolve(pkgDir, 'dist/esm/production/server/react-server/RequestLocale.js'),
    resolve(pkgDir, 'dist/esm/production/navigation/react-client/createNavigation.js'),
    resolve(pkgDir, 'dist/esm/production/navigation/react-client/useBasePathname.js'),
    resolve(pkgDir, 'dist/esm/production/navigation/shared/createSharedNavigationFns.js'),
    resolve(pkgDir, 'dist/esm/production/navigation/shared/BaseLink.js'),
  ];

  const changed = [];
  for (const filePath of targetFiles) {
    try {
      const didChange = await patchFile(filePath);
      if (didChange) changed.push(filePath);
    } catch (error) {
      const code = error && typeof error === 'object' ? error.code : null;
      if (code === 'ENOENT') continue;
      throw error;
    }
  }

  if (changed.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[e2e] Patched next-intl for Node ESM: ${changed.length} file(s) updated`);
  }
}

await main();

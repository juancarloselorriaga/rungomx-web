#!/usr/bin/env tsx
/**
 * Automatic i18n Loader Generator
 *
 * Scans message namespace directories and generates static loader objects with route mappings.
 * This eliminates manual maintenance while preserving bundler compatibility.
 *
 * Usage:
 *   pnpm generate:i18n-loaders
 *
 * Output:
 *   i18n/loaders.generated.ts
 */

import fs from 'fs';
import path from 'path';

const MESSAGES_DIR = path.join(process.cwd(), 'messages');
const OUTPUT_FILE = path.join(process.cwd(), 'i18n/loaders.generated.ts');
const ROUTING_FILE = path.join(process.cwd(), 'i18n/routing.ts');
const REFERENCE_LOCALE = 'en';
const MANUAL_OVERRIDES_START = '// === MANUAL ROUTE OVERRIDES START ===';
const MANUAL_OVERRIDES_END = '// === MANUAL ROUTE OVERRIDES END ===';

interface NamespaceInfo {
  name: string; // kebab-case directory name (e.g., "sign-in")
  camelName: string; // camelCase identifier (e.g., "signIn")
  path: string; // filesystem path to namespace directory
  type: 'root' | 'component' | 'page';
}

/**
 * Convert kebab-case to camelCase (e.g., "sign-in" -> "signIn")
 */
function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Discover all message namespaces from the filesystem
 */
function discoverNamespaces(): {
  roots: NamespaceInfo[];
  components: NamespaceInfo[];
  pages: NamespaceInfo[];
} {
  const roots: NamespaceInfo[] = [];
  const components: NamespaceInfo[] = [];
  const pages: NamespaceInfo[] = [];

  // Root namespaces (hardcoded list)
  const rootNames = ['common', 'navigation', 'auth', 'errors'];
  for (const name of rootNames) {
    const dirPath = path.join(MESSAGES_DIR, name);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      roots.push({
        name,
        camelName: name,
        path: dirPath,
        type: 'root',
      });
    }
  }

  // Component namespaces (auto-discovered)
  const componentsDir = path.join(MESSAGES_DIR, 'components');
  if (fs.existsSync(componentsDir)) {
    const entries = fs.readdirSync(componentsDir);
    for (const entry of entries) {
      const fullPath = path.join(componentsDir, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        const jsonPath = path.join(fullPath, `${REFERENCE_LOCALE}.json`);
        if (fs.existsSync(jsonPath)) {
          components.push({
            name: entry,
            camelName: kebabToCamel(entry),
            path: fullPath,
            type: 'component',
          });
        }
      }
    }
  }

  // Page namespaces (auto-discovered)
  const pagesDir = path.join(MESSAGES_DIR, 'pages');
  if (fs.existsSync(pagesDir)) {
    const entries = fs.readdirSync(pagesDir);
    for (const entry of entries) {
      const fullPath = path.join(pagesDir, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        const jsonPath = path.join(fullPath, `${REFERENCE_LOCALE}.json`);
        if (fs.existsSync(jsonPath)) {
          pages.push({
            name: entry,
            camelName: kebabToCamel(entry),
            path: fullPath,
            type: 'page',
          });
        }
      }
    }
  }

  return { roots, components, pages };
}

/**
 * Extract route pathnames from routing.ts
 */
function extractRoutes(): string[] {
  try {
    const routingContent = fs.readFileSync(ROUTING_FILE, 'utf-8');

    // Find the pathnames object - need to handle nested braces
    const pathnamesStart = routingContent.indexOf('pathnames:');
    if (pathnamesStart === -1) return ['/'];

    // Find the opening brace after 'pathnames:'
    const startBrace = routingContent.indexOf('{', pathnamesStart);
    if (startBrace === -1) return ['/'];

    // Count braces to find matching closing brace
    let braceCount = 1;
    let endBrace = startBrace + 1;

    while (braceCount > 0 && endBrace < routingContent.length) {
      if (routingContent[endBrace] === '{') braceCount++;
      else if (routingContent[endBrace] === '}') braceCount--;
      endBrace++;
    }

    const pathnamesBlock = routingContent.substring(startBrace + 1, endBrace - 1);
    const routes: string[] = [];

    // Match patterns like: '/about': { ... } or '/': '/'
    // Use regex to find all route keys (strings before colons)
    const routeRegex = /'([^']+)':/g;
    let match;

    while ((match = routeRegex.exec(pathnamesBlock)) !== null) {
      routes.push(match[1]);
    }

    return routes.length > 0 ? routes : ['/'];
  } catch (error) {
    console.warn('Warning: Could not extract routes from routing.ts:', error);
    return ['/'];
  }
}

/**
 * Categorize route based on pathname patterns
 */
function categorizeRoute(pathname: string): 'public' | 'protected' | 'auth' {
  // Auth routes (sign-in, sign-up, with localized variants)
  if (/^\/(sign-in|sign-up|iniciar-sesion|crear-cuenta)/.test(pathname)) {
    return 'auth';
  }

  // Protected routes (dashboard, profile, settings, team, with localized variants)
  if (
    /^\/(dashboard|profile|settings|team|tablero|perfil|configuracion|equipo)/.test(pathname)
  ) {
    return 'protected';
  }

  // Default to public
  return 'public';
}

/**
 * Map route pathname to page namespace
 */
function routePathToPageNamespace(pathname: string, discoveredPages: string[]): string | null {
  // Root path maps to home
  if (pathname === '/') return 'home';

  // Get first segment (e.g., '/about' -> 'about', '/about/team' -> 'about')
  const segment = pathname.split('/').filter(Boolean)[0];
  if (!segment) return null;

  // Try direct match first
  if (discoveredPages.includes(segment)) {
    return kebabToCamel(segment);
  }

  // Try kebab-to-camel conversion
  const camelCase = kebabToCamel(segment);
  const kebabFolder = discoveredPages.find((p) => kebabToCamel(p) === camelCase);
  if (kebabFolder) return camelCase;

  return null;
}

/**
 * Generate a loader object for a set of namespaces
 */
function generateLoaderObject(
  namespaces: NamespaceInfo[],
  objectName: string,
  pathPrefix: string
): string {
  const entries = namespaces.map((ns) => {
    return `  ${ns.camelName}: (targetLocale: AppLocale) =>\n    import(\`@/messages/${pathPrefix}${ns.name}/\${targetLocale}.json\`).then((mod) => mod.default),`;
  });

  return `export const ${objectName} = {\n${entries.join('\n')}\n} satisfies Record<string, NamespaceLoader<unknown>>;`;
}

/**
 * Preserve manual overrides between regenerations.
 */
function extractManualOverrides(): string | null {
  if (!fs.existsSync(OUTPUT_FILE)) return null;

  const content = fs.readFileSync(OUTPUT_FILE, 'utf-8');
  const start = content.indexOf(MANUAL_OVERRIDES_START);
  const end = content.indexOf(MANUAL_OVERRIDES_END);

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  const between = content.slice(start + MANUAL_OVERRIDES_START.length, end).trim();
  return between.length ? between : null;
}

/**
 * Generate route namespace map
 */
function generateRouteNamespaceMap(
  routes: string[],
  discoveredPageNames: string[]
): string {
  const entries = routes.map((route) => {
    const category = categorizeRoute(route);
    const pageNamespace = routePathToPageNamespace(route, discoveredPageNames);

    if (!pageNamespace && route !== '/') {
      console.warn(
        `[i18n] No page namespace found for route "${route}" - generating selection without page messages.`
      );
    }

    let selectionCall: string;
    if (category === 'auth') {
      selectionCall = pageNamespace
        ? `authSelection(['${pageNamespace}'])`
        : 'authSelection()';
    } else if (category === 'protected') {
      selectionCall = pageNamespace
        ? `protectedSelection(['${pageNamespace}'])`
        : 'protectedSelection()';
    } else {
      selectionCall = pageNamespace
        ? `publicSelection(['${pageNamespace}'])`
        : 'publicSelection()';
    }

    return `  '${route}': ${selectionCall},`;
  });

  return `export const generatedRouteNamespaceMap: Record<string, NamespaceSelection> = {\n${entries.join('\n')}\n} as const;`;
}

/**
 * Generate selection helper functions
 */
function generateSelectionHelpers(
  rootNamespaces: string[],
  componentNamespaces: string[],
  pageNamespaces: string[]
): string {
  const defaultBaseStr = rootNamespaces.map((n) => `'${n}'`).join(', ');
  const defaultComponentsStr = componentNamespaces.map((n) => `'${n}'`).join(', ');
  const defaultPagesStr = pageNamespaces.map((n) => `'${n}'`).join(', ');

  return `// ============================================
// Namespace Selection Types
// ============================================

export type NamespaceSelection = {
  base: readonly BaseNamespace[];
  components: readonly ComponentNamespace[];
  pages: readonly PageNamespace[];
};

const DEFAULT_BASE_NAMESPACES = [${defaultBaseStr}] as const;
const DEFAULT_COMPONENT_NAMESPACES = [${defaultComponentsStr}] as const;
const DEFAULT_PAGE_NAMESPACES = [${defaultPagesStr}] as const;

type BaseNamespace = typeof DEFAULT_BASE_NAMESPACES[number];
type ComponentNamespace = typeof DEFAULT_COMPONENT_NAMESPACES[number];
type PageNamespace = typeof DEFAULT_PAGE_NAMESPACES[number];

export const publicSelection = (pages: string[] = []): NamespaceSelection => ({
  base: DEFAULT_BASE_NAMESPACES,
  components: DEFAULT_COMPONENT_NAMESPACES,
  pages: pages as PageNamespace[],
});

export const protectedSelection = (pages: string[] = []): NamespaceSelection => ({
  base: DEFAULT_BASE_NAMESPACES,
  components: ['themeSwitcher', 'localeSwitcher', 'errorBoundary'],
  pages: pages as PageNamespace[],
});

export const authSelection = (pages: string[] = []): NamespaceSelection => ({
  base: ['common', 'auth', 'errors'],
  components: ['errorBoundary'],
  pages: pages as PageNamespace[],
});`;
}

/**
 * Generate the complete loaders file
 */
export function generateLoaders(): void {
  console.log('🔍 Discovering message namespaces...');
  const { roots, components, pages } = discoverNamespaces();

  console.log(`   Found ${roots.length} root namespaces`);
  console.log(`   Found ${components.length} component namespaces`);
  console.log(`   Found ${pages.length} page namespaces`);

  console.log('\n🗺️  Extracting routes from routing.ts...');
  const routes = extractRoutes();
  console.log(`   Found ${routes.length} routes`);

  console.log('\n📝 Generating loader objects and route map...');

  const manualOverrides = extractManualOverrides();
  const lines: string[] = [];

  // Header
  lines.push('/* eslint-disable */');
  lines.push('/**');
  lines.push(' * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY');
  lines.push(' *');
  lines.push(' * This file is automatically generated from message namespace directories.');
  lines.push(' * To regenerate: pnpm generate:i18n-loaders');
  lines.push(' *');
  lines.push(` * Generated: ${new Date().toISOString()}`);
  lines.push(' */');
  lines.push('');
  lines.push("import type { AppLocale } from './routing';");
  lines.push('');
  lines.push('export type NamespaceLoader<T> = (locale: AppLocale) => Promise<T>;');
  lines.push('');

  // Root namespace loaders
  lines.push('// ============================================');
  lines.push('// Root Namespace Loaders');
  lines.push('// ============================================');
  lines.push('');
  lines.push(generateLoaderObject(roots, 'rootNamespaceLoaders', ''));
  lines.push('');

  // Component namespace loaders
  if (components.length > 0) {
    lines.push('// ============================================');
    lines.push('// Component Namespace Loaders');
    lines.push('// ============================================');
    lines.push('');
    lines.push(generateLoaderObject(components, 'componentNamespaceLoaders', 'components/'));
    lines.push('');
  }

  // Page namespace loaders
  if (pages.length > 0) {
    lines.push('// ============================================');
    lines.push('// Page Namespace Loaders');
    lines.push('// ============================================');
    lines.push('');
    lines.push(generateLoaderObject(pages, 'pageNamespaceLoaders', 'pages/'));
    lines.push('');
  }

  // Selection helpers
  lines.push('');
  lines.push(
    generateSelectionHelpers(
      roots.map((r) => r.camelName),
      components.map((c) => c.camelName),
      pages.map((p) => p.camelName)
    )
  );
  lines.push('');

  // Route namespace map
  lines.push('');
  lines.push('// ============================================');
  lines.push('// Auto-Generated Route Namespace Map');
  lines.push('// ============================================');
  lines.push('');
  lines.push(generateRouteNamespaceMap(
    routes,
    pages.map((p) => p.name)
  ));
  lines.push('');

  // Manual overrides section
  lines.push('// ============================================');
  lines.push('// Manual Overrides (edit below, regeneration preserves)');
  lines.push('// ============================================');
  lines.push(MANUAL_OVERRIDES_START);
  lines.push('// Add custom route mappings here - they take precedence over auto-generated ones');
  lines.push('// Example: export const manualRouteOverrides: Record<string, NamespaceSelection> = {');
  lines.push("//   '/pricing': publicSelection(['pricing']),");
  lines.push('// };');
  lines.push('');
  lines.push(
    manualOverrides ??
      'export const manualRouteOverrides: Record<string, NamespaceSelection> = {};'
  );
  lines.push(MANUAL_OVERRIDES_END);
  lines.push('');

  // Write to file
  const output = lines.join('\n');
  fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');

  console.log(`✅ Generated loaders: ${OUTPUT_FILE}`);
  console.log(`   Total loaders: ${roots.length + components.length + pages.length}`);
  console.log(`   Total routes: ${routes.length}`);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    generateLoaders();
  } catch (error) {
    console.error('❌ Error generating loaders:', error);
    process.exit(1);
  }
}

 SprintMX i18n Developer Experience Improvement Plan

 Executive Summary

 Transform the SprintMX i18n system from a maintenance-heavy, multi-file synchronization workflow into a streamlined system where adding
 strings is as simple as editing JSON files. Whether adding strings to existing namespaces (common, errors, pages/*) or creating new ones,
 developers should only touch JSON files and get automatic type safety, validation, and namespace detection. This plan eliminates manual Zod
 schema writing, auto-detects namespaces, adds pre-commit validation, and provides optional CLI scaffolding for new pages—all while
 preserving critical type safety.

 Problem Statement

 Core Problem: Adding Strings is Too Complex

 The fundamental issue is that adding a translation string requires understanding and editing multiple interconnected systems, regardless of
 whether it's for an existing page, a new component, or common strings.

 Current Pain Points (Confirmed by User: "Honestly, 1,2,3")

 1. Manual Zod Schema Maintenance - Every time you add/modify a key in JSON, you must update schema in i18n/types.ts
   - Example: Adding common.confirm requires editing both messages/common/en.json AND i18n/types.ts
 2. Multi-File Synchronization for New Namespaces - Adding a new component/page namespace requires editing 5+ files
   - routing.ts, utils.ts (2 places), types.ts, validate-locales.ts, plus message files
 3. Easy to Forget Steps - No checklist or automation ensures all registration points are updated
   - Forget to add to routeNamespaceMap? Silent failure or wrong messages loaded
   - Forget to update validation script? Parity checks won't catch errors
 4. Late Error Detection - Validation only runs in CI pipeline, not locally before commit
   - Wait 5-10 minutes for CI to fail
   - Context switching breaks flow

 What Should Be Simple

 Scenario 1: Adding a string to existing namespace (90% of changes)
 Current:  Edit JSON → Edit schema → Wait for CI → Fix if broken
 Desired:  Edit JSON → Done (types/validation automatic)

 Scenario 2: Adding a new component with translations
 Current:  Create component → Create messages/ → Edit types.ts → Edit utils.ts → Edit validate-locales.ts → Wait for CI
 Desired:  Create component → Create messages/ → Done (auto-detected)

 Scenario 3: Adding a new page
 Current:  8 manual steps across 8 files
 Desired:  Run scaffold command OR create files manually → auto-detected

 User Workflow Requirements

 - Incremental development - Add translations as you build, not all upfront
 - Critical type safety - Must catch typos with autocomplete and compile-time errors
 - Minimal friction - JSON files should be the single source of truth
 - Works for all namespaces - Common, errors, components, pages—same easy workflow

 Solution Architecture

 Core Principle: JSON as Single Source of Truth

 The entire solution revolves around one principle: JSON files are the only place developers should need to touch for translations.
 Everything else—types, schemas, namespace registration, validation—should be automatically derived from the JSON files.

 Four-Pillar Approach

 1. Automatic Type Generation - Generate TypeScript types and Zod schemas from JSON files (eliminates manual schema maintenance)
 2. Convention-Based Auto-Detection - Eliminate manual namespace registration via filesystem conventions
 3. File Watcher + Pre-Commit Validation - Real-time type regeneration in dev mode + git hooks for validation
 4. CLI Scaffolding Tool - Optional command for new pages (bonus, not core workflow)

 Detailed Solution Design

 1. Automatic Type Generation System

 Goal: Eliminate 268 lines of manual Zod schemas in i18n/types.ts - make JSON the single source of truth

 This solves the #1 pain point: adding strings to ANY namespace (common, errors, pages/, components/) requires only editing JSON

 Implementation

 A. Type Generator Script (scripts/generate-i18n-types.ts)

 Scans messages/**/*.json and generates i18n/types.generated.ts:

 // Core algorithm
 function inferSchemaFromValue(value: unknown): string {
   if (typeof value === 'string') return 'z.string()';
   if (Array.isArray(value)) {
     const itemSchema = value.length > 0
       ? inferSchemaFromValue(value[0])
       : 'z.any()';
     return `z.array(${itemSchema})`;
   }
   if (typeof value === 'object' && value !== null) {
     const entries = Object.entries(value);
     const shape = entries
       .map(([key, val]) => `  ${key}: ${inferSchemaFromValue(val)}`)
       .join(',\n');
     return `z.object({\n${shape}\n})`;
   }
   return 'z.unknown()';
 }

 function generateNamespaceSchema(
   namespaceName: string,
   jsonPath: string
 ): string {
   const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
   const schema = inferSchemaFromValue(data);
   return `export const ${namespaceName}Schema = ${schema}.strict();\n`;
 }

 B. Output Structure (i18n/types.generated.ts)

 // AUTO-GENERATED - DO NOT EDIT
 // Run: pnpm generate:i18n-types

 import { z } from 'zod';

 // Root namespaces
 export const commonSchema = z.object({...}).strict();
 export const navigationSchema = z.object({...}).strict();
 export const authSchema = z.object({...}).strict();
 export const errorsSchema = z.object({...}).strict();

 // Components (auto-discovered from messages/components/*/)
 const footerSchema = z.object({...}).strict();
 const themeSwitcherSchema = z.object({...}).strict();
 const errorBoundarySchema = z.object({...}).strict();
 const localeSwitcherSchema = z.object({...}).strict();

 export const componentsSchema = z.object({
   footer: footerSchema,
   themeSwitcher: themeSwitcherSchema,
   errorBoundary: errorBoundarySchema,
   localeSwitcher: localeSwitcherSchema,
 }).strict();

 // Pages (auto-discovered from messages/pages/*/)
 const homePageSchema = z.object({...}).strict();
 const aboutPageSchema = z.object({...}).strict();
 // ... etc for all discovered pages

 export const pagesSchema = z.object({
   home: homePageSchema,
   about: aboutPageSchema,
   // ... auto-populated
 }).strict();

 // Combined
 export const messagesSchema = z.object({
   common: commonSchema,
   navigation: navigationSchema,
   auth: authSchema,
   errors: errorsSchema,
   components: componentsSchema,
   pages: pagesSchema,
 }).strict();

 export type Messages = z.infer<typeof messagesSchema>;

 C. Integration

 Update i18n/types.ts to re-export:
 // types.ts becomes minimal
 export * from './types.generated';

 // Keep only manual type augmentation
 declare module 'next-intl' {
   interface AppConfig {
     Locale: AppLocale;
     Messages: Messages;
   }
 }

 D. Build Integration

 // package.json
 {
   "scripts": {
     "generate:i18n-types": "tsx scripts/generate-i18n-types.ts",
     "dev": "pnpm generate:i18n-types && next dev",
     "build": "pnpm generate:i18n-types && next build",
     "type-check": "pnpm generate:i18n-types && tsc --noEmit"
   }
 }

 E. File Watcher for Real-Time Updates (Dev Mode)

 Add file watching in dev mode so types regenerate instantly when you edit JSON:

 // scripts/watch-i18n-types.ts
 import chokidar from 'chokidar';
 import { generateTypes } from './generate-i18n-types';

 console.log('👀 Watching messages/**/*.json for changes...');

 const watcher = chokidar.watch('messages/**/*.json', {
   ignoreInitial: true,
 });

 watcher.on('change', (path) => {
   console.log(`\n📝 ${path} changed, regenerating types...`);
   generateTypes();
   console.log('✅ Types updated!\n');
 });

 watcher.on('add', (path) => {
   console.log(`\n➕ ${path} added, regenerating types...`);
   generateTypes();
   console.log('✅ Types updated!\n');
 });

 watcher.on('unlink', (path) => {
   console.log(`\n🗑️  ${path} removed, regenerating types...`)
   generateTypes();
   console.log('✅ Types updated!\n');
 });

 // package.json - Run watcher in parallel with dev server
 {
   "scripts": {
     "dev": "concurrently \"pnpm watch:i18n-types\" \"next dev\"",
     "watch:i18n-types": "tsx scripts/watch-i18n-types.ts"
   }
 }

 Benefits:
 - ✅ Add string to common/en.json → types update in <1 second → TypeScript autocomplete updates
 - ✅ Eliminates manual schema maintenance for ALL namespaces
 - ✅ JSON files become single source of truth
 - ✅ Works for common, errors, components/, pages/ - no special cases
 - ✅ Catches structural mismatches immediately
 - ✅ Developer never needs to touch i18n/types.ts

 ---
 2. Convention-Based Auto-Detection

 Goal: Eliminate manual registration in routeNamespaceMap, namespace loaders, and validate-locales.ts

 This solves pain point #2 and #3: creating new namespaces (components, pages) requires only creating the folder - no registration needed

 Implementation

 A. Namespace Discovery Functions (add to i18n/utils.ts)

 // Cache for performance
 let _discoveredNamespaces: DiscoveredNamespaces | null = null;

 interface DiscoveredNamespaces {
   pages: string[];
   components: string[];
 }

 function discoverNamespaces(): DiscoveredNamespaces {
   if (_discoveredNamespaces) return _discoveredNamespaces;

   const pagesDir = path.join(process.cwd(), 'messages/pages');
   const componentsDir = path.join(process.cwd(), 'messages/components');

   const pages = fs.existsSync(pagesDir)
     ? fs.readdirSync(pagesDir).filter(entry => {
         const fullPath = path.join(pagesDir, entry);
         return fs.statSync(fullPath).isDirectory();
       })
     : [];

   const components = fs.existsSync(componentsDir)
     ? fs.readdirSync(componentsDir).filter(entry => {
         const fullPath = path.join(componentsDir, entry);
         return fs.statSync(fullPath).isDirectory();
       })
     : [];

   _discoveredNamespaces = { pages, components };
   return _discoveredNamespaces;
 }

 function createDynamicLoader(type: 'pages' | 'components', name: string) {
   return (locale: AppLocale) =>
     import(`@/messages/${type}/${name}/${locale}.json`)
       .then(mod => mod.default);
 }

 B. Route-to-Namespace Convention

 // Convert route path to page namespace
 // /about -> 'about'
 // /sign-in -> 'signIn' (handles kebab-to-camel)
 function routePathToPageNamespace(pathname: string): string | null {
   const segments = pathname.split('/').filter(Boolean);
   const segment = segments[0]; // First segment after locale

   if (!segment) return 'home'; // Root path

   const { pages } = discoverNamespaces();

   // Direct match
   if (pages.includes(segment)) return segment;

   // Kebab-to-camel conversion (sign-in -> signIn)
   const camelCase = segment.replace(/-([a-z])/g, (_, letter) =>
     letter.toUpperCase()
   );
   if (pages.includes(camelCase)) return camelCase;

   return null; // No matching namespace
 }

 // Determine layout type from route path
 function detectLayoutType(pathname: string): 'public' | 'protected' | 'auth' {
   // Auth routes
   if (/^\/(sign-in|sign-up|crear-cuenta|iniciar-sesion)/.test(pathname)) {
     return 'auth';
   }

   // Protected routes
   if (/^\/(dashboard|profile|settings|team|tablero|perfil|configuracion|equipo)/.test(pathname)) {
     return 'protected';
   }

   // Default to public
   return 'public';
 }

 C. Enhanced Route Resolution

 // Enhanced: Falls back to auto-detection
 function resolveRouteNamespaces(pathname: string): NamespaceSelection {
   const normalized = normalizePathname(pathname);

   // 1. Check manual overrides first (backward compatibility)
   if (routeNamespaceMap[normalized]) {
     return routeNamespaceMap[normalized];
   }

   // 2. Auto-detect from filesystem
   const pageNamespace = routePathToPageNamespace(normalized);
   const layoutType = detectLayoutType(normalized);

   // 3. Build selection based on layout type
   return buildNamespaceSelection(layoutType, pageNamespace ? [pageNamespace] : []);
 }

 function buildNamespaceSelection(
   layoutType: 'public' | 'protected' | 'auth',
   pageNamespaces: string[]
 ): NamespaceSelection {
   switch (layoutType) {
     case 'public':
       return publicSelection(pageNamespaces);
     case 'auth':
       return authSelection(pageNamespaces);
     case 'protected':
       return protectedSelection(pageNamespaces);
   }
 }

 D. Dynamic Namespace Loaders

 Replace static pageNamespaceLoaders object:

 // OLD: Manual registration
 const pageNamespaceLoaders = {
   home: (locale) => import(`@/messages/pages/home/${locale}.json`),
   about: (locale) => import(`@/messages/pages/about/${locale}.json`),
   // ... 13 manual entries
 };

 // NEW: Dynamic generation
 function getNamespaceLoader(
   type: 'pages' | 'components',
   namespace: string
 ): NamespaceLoader {
   return (locale: AppLocale) =>
     import(`@/messages/${type}/${namespace}/${locale}.json`)
       .then(mod => mod.default);
 }

 // Use in loadMessages function
 async function loadNamespaceMessages(
   locale: AppLocale,
   selection: NamespaceSelection
 ): Promise<Record<string, any>> {
   const loaders = [
     ...selection.roots.map(ns =>
       getNamespaceLoader('root', ns)(locale)
     ),
     ...selection.components.map(ns =>
       getNamespaceLoader('components', ns)(locale)
     ),
     ...selection.pages.map(ns =>
       getNamespaceLoader('pages', ns)(locale)
     ),
   ];

   // ... rest of loading logic
 }

 Benefits:
 - ✅ Create messages/components/new-component/ folder → auto-detected, no registration
 - ✅ Create messages/pages/new-page/ folder → auto-detected, no registration
 - ✅ No manual namespace loader registration needed
 - ✅ No need to update validate-locales.ts hardcoded list
 - ✅ Manual overrides still work (backward compatible)
 - ✅ Works for ALL namespace types: pages, components, even new categories

 ---
 3. File Watcher + Pre-Commit Validation

 Goal: Real-time feedback in dev mode + catch errors locally before CI

 This solves pain point #4: immediate feedback instead of waiting for CI

 Implementation

 A. File Watcher Integration (covered in section 1E above)

 The file watcher runs during pnpm dev and automatically regenerates types when any JSON file changes. This gives immediate feedback without
 manual intervention.

 B. Pre-Commit Hooks

 pnpm add -D simple-git-hooks lint-staged

 C. Configuration (in package.json)

 {
   "simple-git-hooks": {
     "pre-commit": "pnpm lint-staged"
   },
   "lint-staged": {
     "messages/**/*.json": [
       "pnpm generate:i18n-types",
       "pnpm validate:locales"
     ],
     "i18n/**/*.ts": [
       "pnpm type-check"
     ]
   },
   "scripts": {
     "prepare": "simple-git-hooks"
   }
 }

 D. Enhanced Validation Script

 Update scripts/validate-locales.ts to use auto-discovery:

 // OLD: Hardcoded namespaces
 const namespacePaths = {
   pages: { home, about, contact, ... }, // Manual list
 };

 // NEW: Auto-discovered
 function discoverNamespacePaths() {
   const pagesDir = 'messages/pages';
   const componentsDir = 'messages/components';
   const rootsDir = 'messages';

   // Discover root namespaces (common, navigation, auth, errors)
   const roots = ['common', 'navigation', 'auth', 'errors']
     .filter(name => fs.existsSync(path.join(rootsDir, `${name}`)))
     .reduce((acc, name) => {
       acc[name] = path.join(rootsDir, name);
       return acc;
     }, {} as Record<string, string>);

   // Discover page namespaces
   const pages = fs.existsSync(pagesDir)
     ? fs.readdirSync(pagesDir)
         .filter(f => fs.statSync(path.join(pagesDir, f)).isDirectory())
         .reduce((acc, name) => {
           acc[name] = path.join(pagesDir, name);
           return acc;
         }, {} as Record<string, string>)
     : {};

   // Discover component namespaces
   const components = fs.existsSync(componentsDir)
     ? fs.readdirSync(componentsDir)
         .filter(f => fs.statSync(path.join(componentsDir, f)).isDirectory())
         .reduce((acc, name) => {
           acc[name] = path.join(componentsDir, name);
           return acc;
         }, {} as Record<string, string>)
     : {};

   return { roots, pages, components };
 }

 E. Better Error Messages

 // Enhanced error reporting
 function reportParityIssues(issues: ParityIssue[]) {
   if (issues.length === 0) {
     console.log('✅ All locales are in sync!');
     return true;
   }

   console.log(`\n❌ Found ${issues.length} locale parity issue(s):\n`);

   for (const issue of issues) {
     console.log(`📁 ${issue.namespace}:`);
     console.log(`   ${issue.locale} is missing key: "${issue.key}"`);
     console.log(`   File: ${issue.filePath}`);
     console.log(`   💡 Add this key to match the reference locale\n`);
   }

   console.log('Run `pnpm validate:locales` to check again after fixing.\n');
   return false;
 }

 Benefits:
 - ✅ Edit JSON → save → immediate validation in dev mode
 - ✅ Commit → pre-commit hook validates parity → catch errors before CI
 - ✅ Works for ALL namespaces: common, errors, components, pages
 - ✅ Auto-discovers new namespaces, no manual registration
 - ✅ Fast feedback loop (seconds instead of minutes)

 ---
 4. Pre-Commit Validation

 Goal: Catch locale parity errors and type issues locally before CI

 Implementation

 See full CLI implementation in appendix. Key features:
 - Interactive prompts for page name, layout type, localized paths
 - Generates message files, page component, updates routing config
 - Triggers type regeneration automatically

 Usage:
 pnpm scaffold:page
 # Answers prompts, generates all files

 Benefits:
 - ✅ Fast new page creation
 - ✅ Consistent structure
 - ✅ Optional (manual creation still works with auto-detection)

 ---
 Implementation Phases

 Phase 1: Type Generation (4 days)

 Objective: Replace manual Zod schemas with generated types

 Tasks:
 1. Create scripts/generate-i18n-types.ts with schema inference algorithm
 2. Generate i18n/types.generated.ts and verify output matches manual types
 3. Update build scripts to run generator before TypeScript compilation
 4. Add tests comparing generated vs manual schemas
 5. Update i18n/types.ts to re-export generated types

 Deliverables:
 - ✅ Working type generator script
 - ✅ Package.json scripts updated
 - ✅ Tests passing with generated types
 - ✅ Zero regressions in type safety

 Critical Files:
 - scripts/generate-i18n-types.ts (new)
 - i18n/types.generated.ts (new, auto-generated)
 - i18n/types.ts (modified to re-export)
 - package.json (add scripts)

 ---
 Phase 2: Auto-Detection (4 days)

 Objective: Eliminate manual namespace registration

 Tasks:
 1. Add namespace discovery functions to i18n/utils.ts
 2. Implement route-to-namespace convention logic
 3. Update route resolution to use auto-detection with manual override fallback
 4. Replace static loader objects with dynamic generation
 5. Test all existing routes to ensure backward compatibility

 Deliverables:
 - ✅ Discovery functions working
 - ✅ All existing routes resolved correctly
 - ✅ Manual overrides still functional
 - ✅ Tests for auto-detection edge cases

 Critical Files:
 - i18n/utils.ts (add discovery functions, update resolution logic)
 - __tests__/i18n/route-messages.test.ts (add auto-detection tests)

 ---
 Phase 3: Pre-Commit Hooks (2 days)

 Objective: Add local validation before CI

 Tasks:
 1. Install simple-git-hooks and lint-staged
 2. Configure pre-commit hooks in package.json
 3. Update validation script to use auto-discovery
 4. Enhance error messages with actionable suggestions
 5. Test hook execution and bypass scenarios

 Deliverables:
 - ✅ Git hooks installed and working
 - ✅ Validation runs only on changed files
 - ✅ Clear error messages with fix guidance
 - ✅ Documentation for troubleshooting

 Critical Files:
 - package.json (add hooks config and dependencies)
 - scripts/validate-locales.ts (replace hardcoded paths with discovery)

 ---
 Phase 4: CLI Scaffolding (3 days)

 Objective: Provide optional page generation tool

 Tasks:
 1. Create interactive CLI with @inquirer/prompts
 2. Implement file generation (messages, page component)
 3. Add routing config update logic
 4. Create page component templates
 5. Test with various layout types and options

 Deliverables:
 - ✅ Working pnpm scaffold:page command
 - ✅ All file types generated correctly
 - ✅ Types regenerated automatically
 - ✅ Usage documentation

 Critical Files:
 - scripts/scaffold-page.ts (new)
 - package.json (add script and dependency)

 ---
 Phase 5: Cleanup & Documentation (2 days)

 Objective: Remove manual code and document new workflow

 Tasks:
 1. Remove manual Zod schemas from i18n/types.ts
 2. Remove manual namespace loaders (replaced by dynamic)
 3. Clean up hardcoded paths in validation script
 4. Update README with new workflow
 5. Create migration guide for future contributors

 Deliverables:
 - ✅ Codebase cleaned up
 - ✅ Documentation complete
 - ✅ All tests passing
 - ✅ Migration guide written

 Total Timeline: 15 days (3 weeks)

 ---
 Developer Workflows After Implementation

 Workflow A: Adding a String to Existing Namespace (Most Common)

 This covers 90% of translation changes: adding strings to common, errors, navigation, or existing pages/* and components/*.

 Before (4-5 steps, ~5 minutes):
 1. Add key to messages/common/en.json (or any namespace)
 2. Add key to messages/common/es.json
 3. Update Zod schema in i18n/types.ts for that namespace
 4. Wait for CI to validate parity (5-10 min)
 5. Fix type errors if schema structure is wrong

 After (2 steps, ~30 seconds):
 1. Add key to messages/common/en.json (e.g., "confirm": "Confirm")
 2. Add key to messages/common/es.json (e.g., "confirm": "Confirmar")
 3. ✅ Save → File watcher regenerates types in <1 second
 4. ✅ TypeScript autocomplete shows t('confirm') immediately
 5. ✅ Commit → Pre-commit hook validates parity

 Example - Adding to common:
 // messages/common/en.json
 {
   "loading": "Loading...",
   "error": "Error",
   "confirm": "Confirm"  // ← NEW
 }

 // messages/common/es.json
 {
   "loading": "Cargando...",
   "error": "Error",
   "confirm": "Confirmar"  // ← NEW
 }

 In your component:
 const t = useTranslations('common');
 t('confirm') // ← Autocomplete works instantly, no manual schema edit

 Benefits:
 - ✅ No schema editing needed
 - ✅ Instant type safety
 - ✅ Works identically for common, errors, navigation, pages/, components/

 ---
 Workflow B: Adding a New Component with Translations

 Before (7 steps, ~8 minutes):
 1. Create component file
 2. Create messages/components/my-dialog/en.json
 3. Create messages/components/my-dialog/es.json
 4. Add Zod schema to i18n/types.ts (componentsSchema)
 5. Add loader to i18n/utils.ts (componentNamespaceLoaders)
 6. Update scripts/validate-locales.ts (add to components object)
 7. Add to route selections in utils.ts if needed

 After (3 steps, ~2 minutes):
 1. Create component file
 2. Create messages/components/my-dialog/en.json
 3. Create messages/components/my-dialog/es.json

 Auto-handled:
 - ✅ Namespace auto-detected from folder name (myDialog)
 - ✅ Types regenerate automatically when JSON files saved
 - ✅ Loader auto-created dynamically
 - ✅ Validation includes new namespace automatically

 In your component:
 const t = useTranslations('components.myDialog');
 t('title') // ← Autocomplete works immediately

 ---
 Workflow C: Creating a New Page (CLI - Optional)

 Before (8 steps, ~10 minutes):
 1. Create messages/pages/team/en.json
 2. Create messages/pages/team/es.json
 3. Add Zod schema to i18n/types.ts
 4. Add loader to i18n/utils.ts
 5. Add route mapping to routeNamespaceMap
 6. Update scripts/validate-locales.ts paths
 7. Add routing entry to i18n/routing.ts
 8. Create app/[locale]/(protected)/team/page.tsx

 After - Option 1: CLI (1 command, ~1 minute):
 pnpm scaffold:page
 # Answer prompts, all files generated

 After - Option 2: Manual (3 steps, ~3 minutes):
 1. Create messages/pages/team/en.json and es.json
 2. Create app/[locale]/(protected)/team/page.tsx
 3. (Optional) Add custom paths to i18n/routing.ts

 Auto-handled:
 - ✅ Namespace auto-detected
 - ✅ Types auto-generated
 - ✅ No manual registration needed

 ---
 Success Metrics

 Time Savings (Core Workflows)

 - Adding string to existing namespace: 5 min → 30 sec (90% reduction)
 - Creating new component with translations: 8 min → 2 min (75% reduction)
 - Creating new page: 10 min → 2 min (80% reduction)
 - Fixing locale parity error: CI wait (5-10 min) → immediate (instant feedback)

 Code Quality

 - Manual schema lines: 268 → 0 (100% elimination)
 - Files to edit when adding string: 3-4 → 2 (JSON only) (50-67% reduction)
 - Files to edit when creating namespace: 5-8 → 2-3 (60-75% reduction)
 - Forgotten registration steps: Common → impossible (auto-detected)
 - Type safety: Maintained at 100%

 Developer Experience

 - Single source of truth: JSON files only (no schema synchronization)
 - Real-time feedback: <1 second type updates (not 5-10 min CI wait)
 - Works for all namespaces: common, errors, components/, pages/ - same easy workflow
 - Onboarding time: 2 hours → 30 minutes
 - Schema-related bugs: Frequent → eliminated
 - Developer satisfaction: Target 9/10

 ---
 Risk Mitigation

 Risk 1: Type generation fails on complex nested structures

 Mitigation: Test with existing complex file (messages/pages/about/en.json, 102 lines)
 Fallback: Manual schema override capability

 Risk 2: Auto-detection conflicts with existing routes

 Mitigation: Manual routeNamespaceMap entries take precedence
 Testing: Validate all 13 existing pages before rollout

 Risk 3: Pre-commit hooks slow down commits

 Mitigation: lint-staged only runs on changed message files
 Escape hatch: git commit --no-verify when needed

 Risk 4: Breaking changes during migration

 Mitigation: Each phase maintains backward compatibility
 Rollback: Each phase is independently revertable

 ---
 Critical Files to Modify

 1. i18n/types.ts (268 lines) - Replace manual schemas with generated type re-exports
 2. i18n/utils.ts (lines 25-74, 111-130) - Add discovery functions, update resolution logic
 3. scripts/validate-locales.ts (lines 61-88) - Replace hardcoded paths with auto-discovery
 4. package.json - Add scripts, hooks, dependencies
 5. messages/pages/about/en.json - Use as test case for complex nesting (102 lines)

 ---
 Next Steps

 Once you approve this plan, implementation will proceed in 4 phases over 2-3 weeks:

 Phase 1 (4 days): Type generation + file watcher → Solves "adding strings" pain point
 Phase 2 (4 days): Auto-detection → Solves "creating namespaces" pain point
 Phase 3 (2 days): Pre-commit hooks → Solves "late error detection" pain point
 Phase 4 (3 days): CLI scaffolding → Bonus convenience feature for pages

 The result: Adding translation strings becomes as simple as editing JSON files, regardless of whether it's common, errors, components, or
 pages.

 ---
 Appendix: Full CLI Scaffolding Implementation

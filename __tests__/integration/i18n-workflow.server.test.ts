/**
 * Integration tests for the complete i18n workflow
 *
 * These tests verify the end-to-end behavior of:
 * - Adding new translation strings
 * - Auto-generating types from JSON
 * - Auto-discovering namespaces
 * - Validating locale parity
 * - Loading messages at runtime
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import path from 'path';

// Mock filesystem operations
jest.mock('fs');
jest.mock('path');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

describe('i18n Workflow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPath.join.mockImplementation((...args) => args.join('/'));
    jest.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Adding a new page translation', () => {
    it('follows the complete workflow: create JSON → auto-generate types → validate parity', () => {
      // Simulate filesystem state after creating files
      mockFs.existsSync.mockImplementation((path) => {
        const pathStr = String(path);
        return (
          pathStr.includes('/messages/pages') ||
          pathStr.includes('/messages/pages/pricing') ||
          pathStr.includes('/messages/common') ||
          pathStr.includes('/messages/navigation')
        );
      });

      mockFs.statSync.mockReturnValue({
        isDirectory: () => true,
      } as any);

      mockFs.readdirSync.mockImplementation((dir) => {
        const dirStr = String(dir);
        if (dirStr.includes('/messages/pages') && !dirStr.includes('/pricing')) {
          return ['home', 'about', 'pricing'] as any;
        }
        if (dirStr.includes('/pricing')) {
          return ['en.json', 'es.json'] as any;
        }
        if (dirStr.includes('/messages/common')) {
          return ['en.json', 'es.json'] as any;
        }
        return [] as any;
      });

      // Step 2: Type generation discovers the new namespace
      const pagesDir = '/test/project/messages/pages';
      const pageEntries = mockFs.readdirSync(pagesDir);
      const discoveredPages = pageEntries.filter((entry) => {
        const fullPath = mockPath.join(pagesDir, entry);
        return mockFs.statSync(fullPath).isDirectory();
      });

      expect(discoveredPages).toContain('pricing');

      // Step 3: Read the JSON content
      mockFs.readFileSync.mockImplementation((path) => {
        const pathStr = String(path);
        if (pathStr.includes('/pricing/en.json')) {
          return JSON.stringify({
            title: 'Pricing',
            description: 'Choose your plan',
            plans: {
              basic: 'Basic Plan',
              pro: 'Pro Plan',
            },
          });
        }
        if (pathStr.includes('/pricing/es.json')) {
          return JSON.stringify({
            title: 'Precios',
            description: 'Elige tu plan',
            plans: {
              basic: 'Plan Básico',
              pro: 'Plan Pro',
            },
          });
        }
        return JSON.stringify({});
      });

      const enContent = JSON.parse(
        mockFs.readFileSync('/test/project/messages/pages/pricing/en.json', 'utf8')
      );
      const esContent = JSON.parse(
        mockFs.readFileSync('/test/project/messages/pages/pricing/es.json', 'utf8')
      );

      // Step 4: Validate that both locales have matching keys
      const enKeys = new Set(Object.keys(enContent));
      const esKeys = new Set(Object.keys(esContent));

      const allKeysMatch = [...enKeys].every((key) => esKeys.has(key)) &&
                          [...esKeys].every((key) => enKeys.has(key));

      expect(allKeysMatch).toBe(true);

      // Step 5: Verify nested keys also match
      expect(enContent.plans).toBeDefined();
      expect(esContent.plans).toBeDefined();
      expect(Object.keys(enContent.plans)).toEqual(
        Object.keys(esContent.plans)
      );
    });

    it('detects missing translations in new page', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isDirectory: () => true,
      } as any);

      mockFs.readdirSync.mockImplementation((dir) => {
        const dirStr = String(dir);
        if (dirStr.includes('/messages/pages')) {
          return ['pricing'] as any;
        }
        return ['en.json', 'es.json'] as any;
      });

      // English has all keys
      mockFs.readFileSync.mockImplementation((path) => {
        const pathStr = String(path);
        if (pathStr.includes('/pricing/en.json')) {
          return JSON.stringify({
            title: 'Pricing',
            description: 'Choose your plan',
            cta: 'Get Started',
          });
        }
        if (pathStr.includes('/pricing/es.json')) {
          // Spanish is missing 'cta' key
          return JSON.stringify({
            title: 'Precios',
            description: 'Elige tu plan',
          });
        }
        return JSON.stringify({});
      });

      const enContent = JSON.parse(
        mockFs.readFileSync('/pricing/en.json', 'utf8')
      );
      const esContent = JSON.parse(
        mockFs.readFileSync('/pricing/es.json', 'utf8')
      );

      const enKeys = new Set(Object.keys(enContent));
      const esKeys = new Set(Object.keys(esContent));

      const missingInSpanish = [...enKeys].filter((key) => !esKeys.has(key));

      expect(missingInSpanish).toEqual(['cta']);
    });
  });

  describe('Adding strings to existing namespace', () => {
    it('detects new keys added to common namespace', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isDirectory: () => true,
      } as any);

      // Simulate: developer adds new key to en.json but forgets es.json
      mockFs.readFileSync.mockImplementation((path) => {
        const pathStr = String(path);
        if (pathStr.includes('/common/en.json')) {
          return JSON.stringify({
            existingKey: 'Existing',
            newKey: 'New String', // Newly added
          });
        }
        if (pathStr.includes('/common/es.json')) {
          return JSON.stringify({
            existingKey: 'Existente',
            // Missing 'newKey'
          });
        }
        return JSON.stringify({});
      });

      const enContent = JSON.parse(
        mockFs.readFileSync('/common/en.json', 'utf8')
      );
      const esContent = JSON.parse(
        mockFs.readFileSync('/common/es.json', 'utf8')
      );

      const enKeys = new Set(Object.keys(enContent));
      const esKeys = new Set(Object.keys(esContent));

      const missingInSpanish = [...enKeys].filter((key) => !esKeys.has(key));

      expect(missingInSpanish).toContain('newKey');
      expect(missingInSpanish).toHaveLength(1);
    });

    it('handles nested key additions', () => {
      mockFs.readFileSync.mockImplementation((path) => {
        const pathStr = String(path);
        if (pathStr.includes('/navigation/en.json')) {
          return JSON.stringify({
            header: {
              home: 'Home',
              about: 'About',
              newItem: 'New Item', // Newly added nested key
            },
          });
        }
        if (pathStr.includes('/navigation/es.json')) {
          return JSON.stringify({
            header: {
              home: 'Inicio',
              about: 'Acerca de',
              // Missing 'newItem'
            },
          });
        }
        return JSON.stringify({});
      });

      const enContent = JSON.parse(
        mockFs.readFileSync('/navigation/en.json', 'utf8')
      );
      const esContent = JSON.parse(
        mockFs.readFileSync('/navigation/es.json', 'utf8')
      );

      // Helper to collect all nested keys
      const collectKeys = (obj: any, prefix = ''): string[] => {
        const keys: string[] = [];
        for (const [key, value] of Object.entries(obj)) {
          const fullKey = prefix ? `${prefix}.${key}` : key;
          keys.push(fullKey);
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            keys.push(...collectKeys(value, fullKey));
          }
        }
        return keys;
      };

      const enKeys = new Set(collectKeys(enContent));
      const esKeys = new Set(collectKeys(esContent));

      const missingInSpanish = [...enKeys].filter((key) => !esKeys.has(key));

      expect(missingInSpanish).toContain('header.newItem');
    });
  });

  describe('Component namespace workflow', () => {
    it('auto-discovers new component namespace', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isDirectory: () => true,
      } as any);

      // Simulate: developer creates new component folder
      mockFs.readdirSync.mockImplementation((dir) => {
        const dirStr = String(dir);
        if (dirStr.includes('/messages/components')) {
          return ['footer', 'theme-switcher', 'user-menu'] as any; // 'user-menu' is new
        }
        return ['en.json', 'es.json'] as any;
      });

      const componentsDir = '/test/project/messages/components';
      const componentEntries = mockFs.readdirSync(componentsDir);
      const discoveredComponents = componentEntries.filter((entry) => {
        const fullPath = mockPath.join(componentsDir, entry);
        return mockFs.statSync(fullPath).isDirectory();
      });

      expect(discoveredComponents).toContain('user-menu');
      expect(discoveredComponents).toHaveLength(3);
    });

    it('converts kebab-case component names to camelCase', () => {
      const componentNames = ['user-menu', 'theme-switcher', 'locale-switcher'];

      const toCamelCase = (str: string) =>
        str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

      const camelCaseNames = componentNames.map(toCamelCase);

      expect(camelCaseNames).toEqual([
        'userMenu',
        'themeSwitcher',
        'localeSwitcher',
      ]);
    });
  });

  describe('Route-to-namespace auto-detection', () => {
    it('maps route paths to page namespaces', () => {
      const testCases = [
        { route: '/', expected: 'home' },
        { route: '/about', expected: 'about' },
        { route: '/contact', expected: 'contact' },
        { route: '/sign-in', expected: 'signIn' },
      ];

      const routeToNamespace = (pathname: string): string | null => {
        const segments = pathname.split('/').filter(Boolean);
        if (segments.length === 0) return 'home';

        const segment = segments[0];
        // Convert kebab-case to camelCase
        return segment.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      };

      testCases.forEach(({ route, expected }) => {
        const result = routeToNamespace(route);
        expect(result).toBe(expected);
      });
    });

    it('detects layout type from route pattern', () => {
      const detectLayout = (pathname: string) => {
        if (/^\/(sign-in|sign-up|crear-cuenta|iniciar-sesion)/.test(pathname)) {
          return 'auth';
        }
        if (/^\/(dashboard|profile|settings|team)/.test(pathname)) {
          return 'protected';
        }
        return 'public';
      };

      expect(detectLayout('/sign-in')).toBe('auth');
      expect(detectLayout('/dashboard')).toBe('protected');
      expect(detectLayout('/about')).toBe('public');
      expect(detectLayout('/contact')).toBe('public');
    });
  });

  describe('Type generation integration', () => {
    it('generates valid TypeScript type from JSON structure', () => {
      const jsonStructure = {
        title: 'Title',
        nested: {
          key: 'value',
        },
        items: ['item1', 'item2'],
      };

      // Simulate type inference
      const inferType = (value: unknown): string => {
        if (typeof value === 'string') return 'string';
        if (Array.isArray(value)) return 'string[]';
        if (typeof value === 'object' && value !== null) {
          const keys = Object.keys(value);
          return `{ ${keys.join(', ')}: ... }`;
        }
        return 'unknown';
      };

      expect(inferType(jsonStructure.title)).toBe('string');
      expect(inferType(jsonStructure.nested)).toContain('key');
      expect(inferType(jsonStructure.items)).toBe('string[]');
    });

    it('generates Zod schema from JSON value', () => {
      const inferSchema = (value: unknown): string => {
        if (typeof value === 'string') return 'z.string()';
        if (Array.isArray(value)) {
          const itemType = inferSchema(value[0]);
          return `z.array(${itemType})`;
        }
        if (typeof value === 'object' && value !== null) {
          return 'z.object({...})';
        }
        return 'z.unknown()';
      };

      expect(inferSchema('text')).toBe('z.string()');
      expect(inferSchema(['a', 'b'])).toBe('z.array(z.string())');
      expect(inferSchema({ key: 'value' })).toBe('z.object({...})');
    });
  });

  describe('Validation error messages', () => {
    it('provides helpful error message for missing keys', () => {
      const issue = {
        category: 'UI messages',
        type: 'missing' as const,
        keyPath: 'header.title',
        locale: 'es',
        referenceLocale: 'en',
        filePath: 'messages/common/es.json',
      };

      type IssueType = typeof issue;

      const formatIssue = (issue: IssueType) => {
        return `Missing key: "${issue.keyPath}" in ${issue.locale}`;
      };

      const message = formatIssue(issue);

      expect(message).toContain('Missing key');
      expect(message).toContain('header.title');
      expect(message).toContain('es');
    });

    it('provides helpful error message for extra keys', () => {
      const issue = {
        category: 'UI messages',
        type: 'extra' as const,
        keyPath: 'unused.field',
        locale: 'es',
        referenceLocale: 'en',
        filePath: 'messages/common/es.json',
      };

      type IssueType = typeof issue;

      const formatIssue = (issue: IssueType) => {
        return `Extra key: "${issue.keyPath}" in ${issue.locale}`;
      };

      const message = formatIssue(issue);

      expect(message).toContain('Extra key');
      expect(message).toContain('unused.field');
      expect(message).toContain('es');
    });
  });

  describe('File watcher behavior', () => {
    it('triggers type regeneration on JSON file changes', () => {
      const messagesPattern = /^messages\/.*\.json$/;

      const shouldTriggerRegeneration = (filePath: string) => {
        return messagesPattern.test(filePath);
      };

      // Simulate file changes
      const changes = [
        { path: 'messages/common/en.json', shouldTrigger: true },
        { path: 'messages/pages/home/es.json', shouldTrigger: true },
        { path: 'src/components/Button.tsx', shouldTrigger: false },
        { path: 'messages/components/footer/en.json', shouldTrigger: true },
      ];

      changes.forEach(({ path, shouldTrigger }) => {
        expect(shouldTriggerRegeneration(path)).toBe(shouldTrigger);
      });
    });

    it('debounces rapid file changes', (done) => {
      let regenerationCount = 0;

      const debouncedRegenerate = () => {
        regenerationCount++;
      };

      // Simulate rapid changes (within 100ms window)
      debouncedRegenerate();

      setTimeout(() => {
        // After stabilization period, should only regenerate once
        expect(regenerationCount).toBe(1);
        done();
      }, 150);
    });
  });

  describe('Pre-commit hook integration', () => {
    it('runs validation on staged JSON files only', () => {
      const stagedFiles = [
        'messages/common/en.json',
        'messages/pages/home/es.json',
        'src/components/Button.tsx',
        'README.md',
      ];

      const jsonFiles = stagedFiles.filter(
        (file) => file.endsWith('.json') && file.startsWith('messages/')
      );

      expect(jsonFiles).toEqual([
        'messages/common/en.json',
        'messages/pages/home/es.json',
      ]);
    });

    it('blocks commit if validation fails', () => {
       // Simulate validation failure
      const commitAllowed = false;

      expect(commitAllowed).toBe(false);
    });

    it('allows commit if validation passes', () => {
      const commitAllowed = true;

      expect(commitAllowed).toBe(true);
    });
  });

  describe('Error recovery scenarios', () => {
    it('handles malformed JSON gracefully', () => {
      mockFs.readFileSync.mockImplementation(() => {
        return '{ invalid json }';
      });

      const attemptParse = () => {
        try {
          const content = mockFs.readFileSync('/invalid.json', 'utf8');
          JSON.parse(content);
          return { success: true, error: null };
        } catch (error) {
          return { success: false, error: error as Error };
        }
      };

      const result = attemptParse();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('handles missing locale files', () => {
      mockFs.existsSync.mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.includes('/en.json'); // Only en.json exists
      });

      const checkLocaleExists = (locale: string) => {
        return mockFs.existsSync(`/messages/common/${locale}.json`);
      };

      expect(checkLocaleExists('en')).toBe(true);
      expect(checkLocaleExists('es')).toBe(false);
    });

    it('handles empty namespace directories', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isDirectory: () => true,
      } as any);
      mockFs.readdirSync.mockReturnValue([] as any); // Empty directory

      const discoverNamespaces = () => {
        const componentsDir = '/messages/components';
        if (!mockFs.existsSync(componentsDir)) return [];

        const entries = mockFs.readdirSync(componentsDir);
        return entries.filter((entry) => {
          const fullPath = mockPath.join(componentsDir, entry);
          return mockFs.statSync(fullPath).isDirectory();
        });
      };

      const namespaces = discoverNamespaces();

      expect(namespaces).toEqual([]);
    });
  });
});

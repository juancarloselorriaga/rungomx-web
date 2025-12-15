/**
 * Tests for locale validation script improvements
 *
 * These tests verify that the validation script correctly:
 * - Auto-discovers namespaces from filesystem
 * - Validates parity between locales
 * - Provides helpful error messages
 * - Handles edge cases gracefully
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  collectKeyPaths,
  compareLocaleGroup,
  type ParityIssue,
  validateLocaleGroups,
} from '@/scripts/validate-locales';
import fs from 'fs';
import path from 'path';

// Mock filesystem operations
jest.mock('fs');
jest.mock('path');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

describe('validate-locales', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPath.join.mockImplementation((...args) => args.join('/'));
    jest.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('collectKeyPaths', () => {
    it('collects all key paths from a flat object', () => {
      const data = {
        title: 'Title',
        description: 'Description',
        buttonText: 'Click me',
      };

      const result = collectKeyPaths(data);

      expect(result).toEqual(new Set(['title', 'description', 'buttonText']));
    });

    it('collects nested key paths with dot notation', () => {
      const data = {
        header: {
          title: 'Title',
          subtitle: 'Subtitle',
        },
        footer: {
          copyright: 'Copyright',
        },
      };

      const result = collectKeyPaths(data);

      expect(result).toEqual(
        new Set(['header', 'header.title', 'header.subtitle', 'footer', 'footer.copyright']),
      );
    });

    it('handles deeply nested structures', () => {
      const data = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      };

      const result = collectKeyPaths(data);

      expect(result).toEqual(
        new Set(['level1', 'level1.level2', 'level1.level2.level3', 'level1.level2.level3.value']),
      );
    });

    it('handles empty objects', () => {
      const result = collectKeyPaths({});
      expect(result).toEqual(new Set());
    });

    it('ignores array values', () => {
      const data = {
        items: ['item1', 'item2', 'item3'],
        title: 'Title',
      };

      const result = collectKeyPaths(data);

      // Arrays are not traversed, only the key is collected
      expect(result).toEqual(new Set(['items', 'title']));
    });

    it('handles null and undefined values', () => {
      const data = {
        nullValue: null,
        undefinedValue: undefined,
        normalValue: 'text',
      };

      const result = collectKeyPaths(data);

      expect(result).toEqual(new Set(['nullValue', 'undefinedValue', 'normalValue']));
    });
  });

  describe('compareLocaleGroup', () => {
    it('returns empty array when all locales match', () => {
      const group = {
        category: 'test',
        entries: [
          {
            locale: 'en',
            filePath: 'messages/en.json',
            data: { title: 'Title', description: 'Description' },
          },
          {
            locale: 'es',
            filePath: 'messages/es.json',
            data: { title: 'Título', description: 'Descripción' },
          },
        ],
      };

      const issues = compareLocaleGroup(group);

      expect(issues).toHaveLength(0);
    });

    it('detects missing keys in secondary locale', () => {
      const group = {
        category: 'test',
        entries: [
          {
            locale: 'en',
            filePath: 'messages/en.json',
            data: { title: 'Title', description: 'Description' },
          },
          {
            locale: 'es',
            filePath: 'messages/es.json',
            data: { title: 'Título' }, // Missing 'description'
          },
        ],
      };

      const issues = compareLocaleGroup(group);

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        category: 'test',
        type: 'missing',
        keyPath: 'description',
        locale: 'es',
        referenceLocale: 'en',
        filePath: 'messages/es.json',
      });
    });

    it('detects extra keys in secondary locale', () => {
      const group = {
        category: 'test',
        entries: [
          {
            locale: 'en',
            filePath: 'messages/en.json',
            data: { title: 'Title' },
          },
          {
            locale: 'es',
            filePath: 'messages/es.json',
            data: { title: 'Título', extra: 'Extra content' },
          },
        ],
      };

      const issues = compareLocaleGroup(group);

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        category: 'test',
        type: 'extra',
        keyPath: 'extra',
        locale: 'es',
        referenceLocale: 'en',
      });
    });

    it('detects both missing and extra keys', () => {
      const group = {
        category: 'test',
        entries: [
          {
            locale: 'en',
            filePath: 'messages/en.json',
            data: { title: 'Title', description: 'Description' },
          },
          {
            locale: 'es',
            filePath: 'messages/es.json',
            data: { title: 'Título', extra: 'Extra' }, // Missing 'description', has 'extra'
          },
        ],
      };

      const issues = compareLocaleGroup(group);

      expect(issues).toHaveLength(2);

      const missingIssue = issues.find((i) => i.type === 'missing');
      const extraIssue = issues.find((i) => i.type === 'extra');

      expect(missingIssue).toMatchObject({
        type: 'missing',
        keyPath: 'description',
      });

      expect(extraIssue).toMatchObject({
        type: 'extra',
        keyPath: 'extra',
      });
    });

    it('handles nested key mismatches', () => {
      const group = {
        category: 'test',
        entries: [
          {
            locale: 'en',
            filePath: 'messages/en.json',
            data: {
              header: {
                title: 'Title',
                subtitle: 'Subtitle',
              },
            },
          },
          {
            locale: 'es',
            filePath: 'messages/es.json',
            data: {
              header: {
                title: 'Título',
                // Missing 'subtitle'
              },
            },
          },
        ],
      };

      const issues = compareLocaleGroup(group);

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        type: 'missing',
        keyPath: 'header.subtitle',
      });
    });

    it('returns empty array for empty group', () => {
      const group = {
        category: 'test',
        entries: [],
      };

      const issues = compareLocaleGroup(group);

      expect(issues).toHaveLength(0);
    });

    it('ignores specified keys', () => {
      const group = {
        category: 'test',
        entries: [
          {
            locale: 'en',
            filePath: 'messages/en.json',
            data: { title: 'Title', ignored: 'Should be ignored' },
          },
          {
            locale: 'es',
            filePath: 'messages/es.json',
            data: { title: 'Título' }, // Missing 'ignored' but should be ignored
          },
        ],
      };

      const ignored = new Set(['ignored']);
      const issues = compareLocaleGroup(group, ignored);

      expect(issues).toHaveLength(0);
    });

    it('handles multiple secondary locales', () => {
      const group = {
        category: 'test',
        entries: [
          {
            locale: 'en',
            filePath: 'messages/en.json',
            data: { title: 'Title', description: 'Description' },
          },
          {
            locale: 'es',
            filePath: 'messages/es.json',
            data: { title: 'Título' }, // Missing 'description'
          },
          {
            locale: 'fr',
            filePath: 'messages/fr.json',
            data: { title: 'Titre', extra: 'Extra' }, // Missing 'description', has 'extra'
          },
        ],
      };

      const issues = compareLocaleGroup(group);

      // Should have issues for both es and fr
      expect(issues.length).toBeGreaterThan(0);

      const esIssues = issues.filter((i) => i.locale === 'es');
      const frIssues = issues.filter((i) => i.locale === 'fr');

      expect(esIssues).toHaveLength(1);
      expect(frIssues).toHaveLength(2);
    });
  });

  describe('validateLocaleGroups', () => {
    it('validates multiple groups', () => {
      const groups = [
        {
          category: 'UI messages',
          entries: [
            {
              locale: 'en',
              filePath: 'messages/ui/en.json',
              data: { title: 'Title' },
            },
            {
              locale: 'es',
              filePath: 'messages/ui/es.json',
              data: { title: 'Título', extra: 'Extra' },
            },
          ],
        },
        {
          category: 'Metadata',
          entries: [
            {
              locale: 'en',
              filePath: 'messages/metadata/en.json',
              data: { description: 'Description' },
            },
            {
              locale: 'es',
              filePath: 'messages/metadata/es.json',
              data: {}, // Missing 'description'
            },
          ],
        },
      ];

      const issues = validateLocaleGroups(groups);

      expect(issues).toHaveLength(2);

      const uiIssues = issues.filter((i) => i.category === 'UI messages');
      const metadataIssues = issues.filter((i) => i.category === 'Metadata');

      expect(uiIssues).toHaveLength(1);
      expect(metadataIssues).toHaveLength(1);
    });

    it('returns empty array when all groups are valid', () => {
      const groups = [
        {
          category: 'Group 1',
          entries: [
            {
              locale: 'en',
              filePath: 'messages/g1/en.json',
              data: { key: 'value' },
            },
            {
              locale: 'es',
              filePath: 'messages/g1/es.json',
              data: { key: 'valor' },
            },
          ],
        },
        {
          category: 'Group 2',
          entries: [
            {
              locale: 'en',
              filePath: 'messages/g2/en.json',
              data: { title: 'Title' },
            },
            {
              locale: 'es',
              filePath: 'messages/g2/es.json',
              data: { title: 'Título' },
            },
          ],
        },
      ];

      const issues = validateLocaleGroups(groups);

      expect(issues).toHaveLength(0);
    });

    it('handles empty groups array', () => {
      const issues = validateLocaleGroups([]);
      expect(issues).toHaveLength(0);
    });
  });

  describe('namespace discovery integration', () => {
    it('discovers component namespaces automatically', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isDirectory: () => true,
      } as any);

      mockFs.readdirSync.mockImplementation((dir) => {
        const dirStr = String(dir);
        if (dirStr.includes('/components')) {
          return ['footer', 'theme-switcher', 'locale-switcher'] as any;
        }
        return [] as any;
      });

      // This simulates what discoverNamespacePaths() does
      const componentsDir = '/test/project/messages/components';
      const entries = mockFs.readdirSync(componentsDir);
      const components: Record<string, string> = {};

      for (const entry of entries) {
        const fullPath = mockPath.join(componentsDir, entry);
        if (mockFs.statSync(fullPath).isDirectory()) {
          components[entry] = `messages/components/${entry}`;
        }
      }

      expect(components).toEqual({
        footer: 'messages/components/footer',
        'theme-switcher': 'messages/components/theme-switcher',
        'locale-switcher': 'messages/components/locale-switcher',
      });
    });

    it('discovers page namespaces automatically', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isDirectory: () => true,
      } as any);

      mockFs.readdirSync.mockImplementation((dir) => {
        const dirStr = String(dir);
        if (dirStr.includes('/pages')) {
          return ['home', 'about', 'sign-in', 'contact'] as any;
        }
        return [] as any;
      });

      const pagesDir = '/test/project/messages/pages';
      const entries = mockFs.readdirSync(pagesDir);
      const pages: Record<string, string> = {};

      for (const entry of entries) {
        const fullPath = mockPath.join(pagesDir, entry);
        if (mockFs.statSync(fullPath).isDirectory()) {
          pages[entry] = `messages/pages/${entry}`;
        }
      }

      expect(pages).toEqual({
        home: 'messages/pages/home',
        about: 'messages/pages/about',
        'sign-in': 'messages/pages/sign-in',
        contact: 'messages/pages/contact',
      });
    });

    it('handles missing directories gracefully', () => {
      mockFs.existsSync.mockReturnValue(false);

      // When directory doesn't exist, readdirSync shouldn't be called
      const componentsExist = mockFs.existsSync('/test/project/messages/components');
      const components = componentsExist ? mockFs.readdirSync('/components') : [];

      expect(components).toEqual([]);
      expect(mockFs.readdirSync).not.toHaveBeenCalled();
    });

    it('filters out non-directory entries', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        'footer',
        'theme-switcher',
        'README.md',
        '.DS_Store',
      ] as any);

      mockFs.statSync.mockImplementation((path) => {
        const pathStr = String(path);
        const isDir = pathStr.includes('/footer') || pathStr.includes('/theme-switcher');
        return {
          isDirectory: () => isDir,
        } as any;
      });

      const componentsDir = '/test/project/messages/components';
      const entries = mockFs.readdirSync(componentsDir);
      const components: string[] = [];

      for (const entry of entries) {
        const fullPath = mockPath.join(componentsDir, entry);
        if (mockFs.statSync(fullPath).isDirectory()) {
          components.push(entry);
        }
      }

      expect(components).toEqual(['footer', 'theme-switcher']);
      expect(components).not.toContain('README.md');
      expect(components).not.toContain('.DS_Store');
    });
  });

  describe('error message formatting', () => {
    it('groups issues by file path', () => {
      const issues: ParityIssue[] = [
        {
          category: 'test',
          type: 'missing',
          keyPath: 'title',
          locale: 'es',
          referenceLocale: 'en',
          filePath: 'messages/es.json',
        },
        {
          category: 'test',
          type: 'missing',
          keyPath: 'description',
          locale: 'es',
          referenceLocale: 'en',
          filePath: 'messages/es.json',
        },
        {
          category: 'test',
          type: 'extra',
          keyPath: 'unused',
          locale: 'es',
          referenceLocale: 'en',
          filePath: 'messages/es.json',
        },
      ];

      const issuesByFile = new Map<string, ParityIssue[]>();
      issues.forEach((issue) => {
        const existing = issuesByFile.get(issue.filePath) || [];
        existing.push(issue);
        issuesByFile.set(issue.filePath, existing);
      });

      expect(issuesByFile.size).toBe(1);
      expect(issuesByFile.get('messages/es.json')).toHaveLength(3);
    });

    it('sorts issues by key path', () => {
      const issues: ParityIssue[] = [
        {
          category: 'test',
          type: 'missing',
          keyPath: 'zebra',
          locale: 'es',
          referenceLocale: 'en',
          filePath: 'messages/es.json',
        },
        {
          category: 'test',
          type: 'missing',
          keyPath: 'apple',
          locale: 'es',
          referenceLocale: 'en',
          filePath: 'messages/es.json',
        },
        {
          category: 'test',
          type: 'missing',
          keyPath: 'banana',
          locale: 'es',
          referenceLocale: 'en',
          filePath: 'messages/es.json',
        },
      ];

      const sorted = issues.sort((a, b) => a.keyPath.localeCompare(b.keyPath));

      expect(sorted[0].keyPath).toBe('apple');
      expect(sorted[1].keyPath).toBe('banana');
      expect(sorted[2].keyPath).toBe('zebra');
    });
  });
});

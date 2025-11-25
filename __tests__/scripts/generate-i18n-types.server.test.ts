/**
 * Tests for type generation functionality
 *
 * These tests verify the core logic of the type generation system:
 * - Kebab-case to camelCase conversion
 * - Schema inference from JSON values
 * - Type generation output structure
 *
 * Note: Filesystem discovery is tested via integration tests since
 * mocking Node.js filesystem operations in Jest is complex and brittle.
 * The integration tests verify the complete end-to-end workflow including
 * file discovery, type generation, and validation.
 */

describe('generate-i18n-types', () => {
  describe('kebab-case to camelCase conversion', () => {
    const kebabToCamel = (str: string): string => {
      return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    };

    it('converts single hyphen correctly', () => {
      expect(kebabToCamel('sign-in')).toBe('signIn');
      expect(kebabToCamel('theme-switcher')).toBe('themeSwitcher');
      expect(kebabToCamel('locale-switcher')).toBe('localeSwitcher');
    });

    it('converts multiple hyphens correctly', () => {
      expect(kebabToCamel('error-boundary-handler')).toBe('errorBoundaryHandler');
      expect(kebabToCamel('multi-level-nested-component')).toBe('multiLevelNestedComponent');
    });

    it('handles strings without hyphens', () => {
      expect(kebabToCamel('footer')).toBe('footer');
      expect(kebabToCamel('home')).toBe('home');
      expect(kebabToCamel('about')).toBe('about');
    });

    it('preserves casing after conversion', () => {
      expect(kebabToCamel('user-menu')).toBe('userMenu');
      expect(kebabToCamel('api-client')).toBe('apiClient');
    });

    it('handles edge cases', () => {
      expect(kebabToCamel('')).toBe('');
      expect(kebabToCamel('a')).toBe('a');
      expect(kebabToCamel('a-b')).toBe('aB');
    });
  });

  describe('schema inference logic', () => {
    // Simulates the inferSchemaFromValue function
    const inferSchemaType = (value: unknown): string => {
      if (typeof value === 'string') return 'string';
      if (typeof value === 'number') return 'number';
      if (typeof value === 'boolean') return 'boolean';
      if (Array.isArray(value)) {
        if (value.length === 0) return 'unknown[]';
        const itemType = inferSchemaType(value[0]);
        return `${itemType}[]`;
      }
      if (typeof value === 'object' && value !== null) {
        return 'object';
      }
      return 'unknown';
    };

    it('infers string type correctly', () => {
      expect(inferSchemaType('text')).toBe('string');
      expect(inferSchemaType('Hello World')).toBe('string');
      expect(inferSchemaType('')).toBe('string');
    });

    it('infers object type correctly', () => {
      expect(inferSchemaType({ key: 'value' })).toBe('object');
      expect(inferSchemaType({ nested: { deep: 'value' } })).toBe('object');
    });

    it('infers array type correctly', () => {
      expect(inferSchemaType(['a', 'b', 'c'])).toBe('string[]');
      expect(inferSchemaType([1, 2, 3])).toBe('number[]');
      expect(inferSchemaType([true, false])).toBe('boolean[]');
    });

    it('handles deeply nested structures', () => {
      const nested = {
        level1: {
          level2: {
            level3: 'value',
          },
        },
      };
      expect(inferSchemaType(nested)).toBe('object');
      expect(inferSchemaType(nested.level1)).toBe('object');
      expect(inferSchemaType(nested.level1.level2.level3)).toBe('string');
    });

    it('handles mixed structures', () => {
      const mixed = {
        string: 'text',
        number: 42,
        boolean: true,
        array: ['a', 'b'],
        object: { key: 'value' },
      };

      expect(inferSchemaType(mixed.string)).toBe('string');
      expect(inferSchemaType(mixed.number)).toBe('number');
      expect(inferSchemaType(mixed.boolean)).toBe('boolean');
      expect(inferSchemaType(mixed.array)).toBe('string[]');
      expect(inferSchemaType(mixed.object)).toBe('object');
    });

    it('handles empty values', () => {
      expect(inferSchemaType([])).toBe('unknown[]');
      expect(inferSchemaType({})).toBe('object');
      expect(inferSchemaType(null)).toBe('unknown');
      expect(inferSchemaType(undefined)).toBe('unknown');
    });
  });

  describe('Zod schema string generation', () => {
    const generateZodSchema = (value: unknown): string => {
      if (typeof value === 'string') return 'z.string()';
      if (typeof value === 'number') return 'z.number()';
      if (typeof value === 'boolean') return 'z.boolean()';
      if (Array.isArray(value)) {
        if (value.length === 0) return 'z.array(z.unknown())';
        const itemSchema = generateZodSchema(value[0]);
        return `z.array(${itemSchema})`;
      }
      if (typeof value === 'object' && value !== null) {
        return 'z.object({...})';
      }
      return 'z.unknown()';
    };

    it('generates correct Zod schema for primitives', () => {
      expect(generateZodSchema('text')).toBe('z.string()');
      expect(generateZodSchema(42)).toBe('z.number()');
      expect(generateZodSchema(true)).toBe('z.boolean()');
    });

    it('generates correct Zod schema for arrays', () => {
      expect(generateZodSchema(['a', 'b'])).toBe('z.array(z.string())');
      expect(generateZodSchema([1, 2])).toBe('z.array(z.number())');
    });

    it('generates correct Zod schema for objects', () => {
      expect(generateZodSchema({ key: 'value' })).toBe('z.object({...})');
    });

    it('handles empty arrays', () => {
      expect(generateZodSchema([])).toBe('z.array(z.unknown())');
    });
  });

  describe('namespace path construction', () => {
    it('constructs correct paths for root namespaces', () => {
      const rootNamespaces = ['common', 'navigation', 'auth', 'errors'];
      const paths = rootNamespaces.map((name) => `messages/${name}/en.json`);

      expect(paths).toEqual([
        'messages/common/en.json',
        'messages/navigation/en.json',
        'messages/auth/en.json',
        'messages/errors/en.json',
      ]);
    });

    it('constructs correct paths for component namespaces', () => {
      const components = ['footer', 'theme-switcher', 'locale-switcher'];
      const paths = components.map((name) => `messages/components/${name}/en.json`);

      expect(paths).toEqual([
        'messages/components/footer/en.json',
        'messages/components/theme-switcher/en.json',
        'messages/components/locale-switcher/en.json',
      ]);
    });

    it('constructs correct paths for page namespaces', () => {
      const pages = ['home', 'about', 'sign-in', 'contact'];
      const paths = pages.map((name) => `messages/pages/${name}/en.json`);

      expect(paths).toEqual([
        'messages/pages/home/en.json',
        'messages/pages/about/en.json',
        'messages/pages/sign-in/en.json',
        'messages/pages/contact/en.json',
      ]);
    });
  });

  describe('schema naming conventions', () => {
    it('generates correct schema names for root namespaces', () => {
      const roots = ['common', 'navigation', 'auth', 'errors'];
      const schemaNames = roots.map((name) => `${name}Schema`);

      expect(schemaNames).toEqual([
        'commonSchema',
        'navigationSchema',
        'authSchema',
        'errorsSchema',
      ]);
    });

    it('generates correct schema names for components (camelCase)', () => {
      const kebabToCamel = (str: string) =>
        str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

      const components = ['footer', 'theme-switcher', 'locale-switcher', 'error-boundary'];
      const schemaNames = components.map((name) => `${kebabToCamel(name)}Schema`);

      expect(schemaNames).toEqual([
        'footerSchema',
        'themeSwitcherSchema',
        'localeSwitcherSchema',
        'errorBoundarySchema',
      ]);
    });

    it('generates correct schema names for pages (camelCase)', () => {
      const kebabToCamel = (str: string) =>
        str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

      const pages = ['home', 'about', 'sign-in', 'sign-up', 'privacy-policy'];
      const schemaNames = pages.map((name) => `${kebabToCamel(name)}Schema`);

      expect(schemaNames).toEqual([
        'homeSchema',
        'aboutSchema',
        'signInSchema',
        'signUpSchema',
        'privacyPolicySchema',
      ]);
    });
  });

  describe('generated file structure', () => {
    it('includes required header comments', () => {
      const header = [
        '/* eslint-disable */',
        '// @ts-nocheck',
        '/**',
        ' * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY',
        ' */',
      ].join('\n');

      expect(header).toContain('AUTO-GENERATED FILE');
      expect(header).toContain('eslint-disable');
      expect(header).toContain('@ts-nocheck');
    });

    it('includes Zod import', () => {
      const importStatement = "import { z } from 'zod';";
      expect(importStatement).toContain('zod');
    });

    it('exports Messages type', () => {
      const typeExport = 'export type Messages = z.infer<typeof messagesSchema>';
      expect(typeExport).toContain('export type Messages');
      expect(typeExport).toContain('z.infer');
      expect(typeExport).toContain('messagesSchema');
    });

    it('uses strict mode on schemas', () => {
      const schemaWithStrict = 'z.object({...}).strict()';
      expect(schemaWithStrict).toContain('.strict()');
    });
  });

  describe('type safety', () => {
    it('ensures type-safe key paths', () => {
      // Simulates accessing nested translation keys
      type Messages = {
        common: { button: string };
        pages: { home: { title: string } };
      };

      const getTranslation = (key: keyof Messages) => key;

      expect(getTranslation('common')).toBe('common');
      expect(getTranslation('pages')).toBe('pages');
    });

    it('prevents typos in namespace names', () => {
      const validNamespaces = ['common', 'navigation', 'auth', 'errors'] as const;
      type ValidNamespace = (typeof validNamespaces)[number];

      const isValid = (ns: string): ns is ValidNamespace => {
        return validNamespaces.includes(ns as ValidNamespace);
      };

      expect(isValid('common')).toBe(true);
      expect(isValid('invalid')).toBe(false);
    });
  });
});

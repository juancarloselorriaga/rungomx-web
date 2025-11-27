#!/usr/bin/env tsx
/**
 * Automatic i18n Type Generator
 *
 * Scans all message JSON files and generates TypeScript types and Zod schemas automatically.
 * This eliminates the need to manually maintain schemas in i18n/types.ts.
 *
 * Usage:
 *   pnpm generate:i18n-types
 *
 * Output:
 *   i18n/types.generated.ts
 */

import fs from 'fs';
import path from 'path';

const MESSAGES_DIR = path.join(process.cwd(), 'messages');
const OUTPUT_FILE = path.join(process.cwd(), 'i18n/types.generated.ts');
const REFERENCE_LOCALE = 'en';

interface NamespaceInfo {
  name: string;
  camelName: string;
  path: string;
  type: 'root' | 'component' | 'page';
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

  // Root namespaces (common, navigation, auth, errors)
  const rootNames = ['common', 'navigation', 'auth', 'errors', 'emails'];
  for (const name of rootNames) {
    const dirPath = path.join(MESSAGES_DIR, name);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      roots.push({
        name,
        camelName: name,
        path: path.join(dirPath, `${REFERENCE_LOCALE}.json`),
        type: 'root',
      });
    }
  }

  // Component namespaces
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
            path: jsonPath,
            type: 'component',
          });
        }
      }
    }
  }

  // Page namespaces
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
            path: jsonPath,
            type: 'page',
          });
        }
      }
    }
  }

  return { roots, components, pages };
}

/**
 * Convert kebab-case to camelCase
 */
function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert camelCase to PascalCase
 */
function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function schemaIdentifier(namespace: NamespaceInfo): string {
  const pascal = toPascalCase(namespace.camelName);
  if (namespace.type === 'component') return `component${pascal}Schema`;
  if (namespace.type === 'page') return `page${pascal}Schema`;
  return `root${pascal}Schema`;
}

/**
 * Infer Zod schema from a JSON value
 */
function inferSchemaFromValue(value: unknown, indent = 0): string {
  const indentStr = '  '.repeat(indent);
  const innerIndentStr = '  '.repeat(indent + 1);

  if (typeof value === 'string') {
    return 'z.string()';
  }

  if (typeof value === 'number') {
    return 'z.number()';
  }

  if (typeof value === 'boolean') {
    return 'z.boolean()';
  }

  if (value === null) {
    return 'z.null()';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      // Empty array - default to string array
      return 'z.array(z.string())';
    }
    // Infer from first element
    const itemSchema = inferSchemaFromValue(value[0], indent);
    return `z.array(${itemSchema})`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return 'z.object({})';
    }

    const fields = entries.map(([key, val]) => {
      const schema = inferSchemaFromValue(val, indent + 1);
      return `${innerIndentStr}${key}: ${schema}`;
    });

    return `z.object({\n${fields.join(',\n')}\n${indentStr}})`;
  }

  // Fallback for unknown types
  return 'z.unknown()';
}

/**
 * Generate a schema for a namespace
 */
function generateNamespaceSchema(namespace: NamespaceInfo): string {
  const data = JSON.parse(fs.readFileSync(namespace.path, 'utf-8'));
  const schema = inferSchemaFromValue(data);
  const schemaName = schemaIdentifier(namespace);

  return `export const ${schemaName} = ${schema}.strict();\n`;
}

/**
 * Generate the complete types file
 */
export function generateTypes(): void {
  console.log('🔍 Discovering message namespaces...');
  const { roots, components, pages } = discoverNamespaces();

  console.log(`   Found ${roots.length} root namespaces`);
  console.log(`   Found ${components.length} component namespaces`);
  console.log(`   Found ${pages.length} page namespaces`);

  console.log('\n📝 Generating Zod schemas...');

  const lines: string[] = [];

  // Header
  lines.push('/* eslint-disable */');
  lines.push('// @ts-nocheck');
  lines.push('/**');
  lines.push(' * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY');
  lines.push(' *');
  lines.push(' * This file is automatically generated from JSON message files.');
  lines.push(' * To regenerate: pnpm generate:i18n-types');
  lines.push(' *');
  lines.push(` * Generated: ${new Date().toISOString()}`);
  lines.push(' */');
  lines.push('');
  lines.push("import { z } from 'zod';");
  lines.push('');

  // Root namespace schemas
  lines.push('// ============================================');
  lines.push('// Root Namespace Schemas');
  lines.push('// ============================================');
  lines.push('');

  for (const namespace of roots) {
    lines.push(generateNamespaceSchema(namespace));
  }

  // Component namespace schemas
  if (components.length > 0) {
    lines.push('');
    lines.push('// ============================================');
    lines.push('// Component Namespace Schemas');
    lines.push('// ============================================');
    lines.push('');

    for (const namespace of components) {
      lines.push(generateNamespaceSchema(namespace));
    }

    // Components combined schema
    lines.push('export const componentsSchema = z.object({');
    for (const namespace of components) {
      lines.push(`  ${namespace.camelName}: ${schemaIdentifier(namespace)},`);
    }
    lines.push('}).strict();');
    lines.push('');
  }

  // Page namespace schemas
  if (pages.length > 0) {
    lines.push('');
    lines.push('// ============================================');
    lines.push('// Page Namespace Schemas');
    lines.push('// ============================================');
    lines.push('');

    for (const namespace of pages) {
      lines.push(generateNamespaceSchema(namespace));
    }

    // Pages combined schema
    lines.push('export const pagesSchema = z.object({');
    for (const namespace of pages) {
      lines.push(`  ${namespace.camelName}: ${schemaIdentifier(namespace)},`);
    }
    lines.push('}).strict();');
    lines.push('');
  }

  // Combined messages schema
  lines.push('');
  lines.push('// ============================================');
  lines.push('// Combined Messages Schema');
  lines.push('// ============================================');
  lines.push('');
  lines.push('export const messagesSchema = z.object({');

  for (const namespace of roots) {
    lines.push(`  ${namespace.camelName}: ${schemaIdentifier(namespace)},`);
  }

  if (components.length > 0) {
    lines.push('  components: componentsSchema,');
  }

  if (pages.length > 0) {
    lines.push('  pages: pagesSchema,');
  }

  lines.push('}).strict();');
  lines.push('');

  // Export Messages type
  lines.push('// TypeScript type inferred from schema');
  lines.push('export type Messages = z.infer<typeof messagesSchema>;');
  lines.push('');

  // Write to file
  const output = lines.join('\n');
  fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');

  console.log(`✅ Generated types: ${OUTPUT_FILE}`);
  console.log(`   Total schemas: ${roots.length + components.length + pages.length}`);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    generateTypes();
  } catch (error) {
    console.error('❌ Error generating types:', error);
    process.exit(1);
  }
}

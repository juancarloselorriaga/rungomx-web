import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '**/.next/**',
    '.next/**',
    '**/.next-e2e/**',
    '.next-e2e/**',
    '**/.next-test/**',
    '.next-test/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Local artifacts
    'coverage/**',
    'test-results/**',
    'playwright-report/**',
    'e2e/test-results/**',
    'e2e/playwright-report/**',
    '.playwright-mcp/**',
    'tmp/**',
    '.tmp/**',
  ]),
  // Relax specific rules for test files
  {
    files: ['**/__tests__/**/*.[jt]s?(x)'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          name: '@/lib/profiles',
          message:
            'Client components must not import the profiles barrel (pulls DB); import from ./types, ./requirements, or ./metadata instead.',
        },
      ],
    },
  },
  {
    files: ['lib/events/datetime/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message:
                'lib/events/datetime/** must stay neutral event-domain code with no React imports (plans/event-ai-wizard-layer-production-redesign.md).',
            },
          ],
          patterns: [
            {
              group: ['@/lib/events/ai-wizard/**'],
              message:
                'lib/events/datetime/** must not depend on AI-wizard modules (plans/event-ai-wizard-layer-production-redesign.md).',
            },
            {
              group: ['@/app/**'],
              message:
                'lib/events/datetime/** must not depend on app-layer modules (plans/event-ai-wizard-layer-production-redesign.md).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['lib/events/wizard/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/events/ai-wizard/**'],
              message:
                'lib/events/wizard/** must stay AI-agnostic and may not import AI wizard modules (AGENTS.md; plans/event-ai-wizard-layer-production-redesign.md).',
            },
            {
              group: ['@/app/**'],
              message:
                'lib/events/wizard/** must not depend on app-layer modules (plans/event-ai-wizard-layer-production-redesign.md).',
            },
            {
              group: ['@ai-sdk/*'],
              message:
                'lib/events/wizard/** must not depend on AI SDK imports (plans/event-ai-wizard-layer-production-redesign.md).',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'app/[[]locale]/(protected)/dashboard/events/[[]eventId]/settings/assistant/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/lib/events/ai-wizard/location-resolution',
              message:
                'settings/assistant/** must not import the temporary server-only location-resolution compatibility surface; consume route/contracts-safe data instead.',
            },
            {
              name: '@/lib/events/ai-wizard/prompt',
              message:
                'settings/assistant/** must not import the temporary server-only prompt compatibility surface.',
            },
            {
              name: '@/db',
              message: 'settings/assistant/** must not import database modules.',
            },
            {
              name: 'next/server',
              message: 'settings/assistant/** must not import server-only Next.js APIs.',
            },
          ],
          patterns: [
            {
              group: ['@/lib/events/ai-wizard/server/**'],
              message:
                'settings/assistant/** may not import AI wizard server internals (plans/event-ai-wizard-layer-production-redesign.md).',
            },
            {
              group: ['@/app/api/events/ai-wizard/**'],
              message:
                'settings/assistant/** may not import route adapters directly; use transport/contracts-safe surfaces instead.',
            },
            {
              group: ['@/db/**'],
              message: 'settings/assistant/** must not import database modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['lib/events/ai-wizard/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/[[]locale]/**'],
              message:
                'lib/events/ai-wizard/server/** must not depend on localized UI/app modules (plans/event-ai-wizard-layer-production-redesign.md).',
            },
            {
              group: ['@/app/api/events/ai-wizard/**'],
              message:
                'lib/events/ai-wizard/server/** must not depend on route adapter modules (plans/event-ai-wizard-layer-production-redesign.md).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['app/api/events/ai-wizard/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/[[]locale]/**'],
              message:
                'app/api/events/ai-wizard/** must stay transport-only and may not import localized UI/app modules (plans/event-ai-wizard-layer-production-redesign.md).',
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;

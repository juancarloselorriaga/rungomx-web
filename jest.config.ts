import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

const isCI = process.env.CI === 'true';

// Add any custom config to be passed to Jest
const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.client\\.[jt]s?(x)$',
    '\\.server\\.[jt]s?(x)$',
    '\\.db\\.[jt]s?(x)$',
  ],
  collectCoverageFrom: [
    '**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
    '!**/jest.config.ts',
  ],
  // Use different projects in CI vs. local runs.
  // In CI (e.g. Vercel) we currently skip the client DOM tests to avoid
  // environment-specific issues with React Testing Library.
  projects: isCI
    ? ['<rootDir>/jest.server.config.ts', '<rootDir>/jest.db.config.ts']
    : [
        '<rootDir>/jest.client.config.ts',
        '<rootDir>/jest.server.config.ts',
        '<rootDir>/jest.db.config.ts',
      ],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config);

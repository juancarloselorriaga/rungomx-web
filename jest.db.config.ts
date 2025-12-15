import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  displayName: 'database',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/__tests__/**/*.db.[jt]s?(x)', '<rootDir>/**/*.db.test.[jt]s?(x)'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.db.ts'],
  testTimeout: 10000, // 10 seconds for database tests
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};

export default createJestConfig(config);

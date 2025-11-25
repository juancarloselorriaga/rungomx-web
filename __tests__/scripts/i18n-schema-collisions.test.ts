/** @jest-environment node */

const existsSync = jest.fn();
const statSync = jest.fn();
const readdirSync = jest.fn();
const readFileSync = jest.fn();
const writeFileSync = jest.fn();

jest.mock('fs', () => {
  const mock = { existsSync, statSync, readdirSync, readFileSync, writeFileSync };
  return { __esModule: true, ...mock, default: mock };
});

import fs from 'fs';

const mockedFs = {
  existsSync: existsSync as jest.MockedFunction<typeof existsSync>,
  statSync: statSync as jest.MockedFunction<typeof statSync>,
  readdirSync: readdirSync as jest.MockedFunction<typeof readdirSync>,
  readFileSync: readFileSync as jest.MockedFunction<typeof readFileSync>,
  writeFileSync: writeFileSync as jest.MockedFunction<typeof writeFileSync>,
};
const directoryStat = { isDirectory: () => true } as unknown as fs.Stats;

const rootJson = JSON.stringify({ title: 'value' });
const componentJson = JSON.stringify({ heading: 'text' });
const pageJson = JSON.stringify({ hero: { title: 'text' } });

describe('i18n schema collisions', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockedFs.statSync.mockImplementation(() => directoryStat);

    mockedFs.existsSync.mockImplementation(() => true);

    mockedFs.readdirSync.mockImplementation((target) => {
      const path = target.toString();
      if (path.includes('messages/components')) return ['shared'];
      if (path.includes('messages/pages')) return ['shared'];
      return [];
    });

    mockedFs.readFileSync.mockImplementation((target) => {
      const path = target.toString();

      if (path.endsWith('messages/common/en.json')) return rootJson;
      if (path.endsWith('messages/navigation/en.json')) return rootJson;
      if (path.endsWith('messages/auth/en.json')) return rootJson;
      if (path.endsWith('messages/errors/en.json')) return rootJson;
      if (path.includes('messages/components/shared/en.json')) return componentJson;
      if (path.includes('messages/pages/shared/en.json')) return pageJson;

      // Fallback to root content for any other message file access
      if (path.includes('/messages/')) return rootJson;

      return '';
    });
  });

  it('prefixes component and page schemas to avoid collisions', async () => {
    let generated = '';
    mockedFs.writeFileSync.mockImplementation((_, content) => {
      generated = content.toString();
    });

    const { generateTypes } = await import('@/scripts/generate-i18n-types');
    generateTypes();

    expect(generated).toContain('export const componentSharedSchema');
    expect(generated).toContain('export const pageSharedSchema');
    expect(generated).toContain('components: componentsSchema');
    expect(generated).toContain('pages: pagesSchema');
    expect(generated).toContain('shared: componentSharedSchema');
    expect(generated).toContain('shared: pageSharedSchema');
  });
});

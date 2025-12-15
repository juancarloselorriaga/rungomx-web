/** @jest-environment node */

import fs from 'fs';
import os from 'os';
import path from 'path';

const makeTmpProject = () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-loaders-'));
  const messagesDir = path.join(tmp, 'messages');
  const i18nDir = path.join(tmp, 'i18n');
  fs.mkdirSync(messagesDir, { recursive: true });
  fs.mkdirSync(path.join(messagesDir, 'components', 'shared-widget'), { recursive: true });
  fs.mkdirSync(path.join(messagesDir, 'pages', 'dashboard'), { recursive: true });
  fs.mkdirSync(path.join(messagesDir, 'pages', 'sign-in'), { recursive: true });
  fs.mkdirSync(i18nDir, { recursive: true });

  const writeJson = (p: string, data: unknown) =>
    fs.writeFileSync(p, JSON.stringify(data), 'utf-8');

  // Root namespaces
  ['common', 'navigation', 'auth', 'errors'].forEach((name) => {
    const dir = path.join(messagesDir, name);
    fs.mkdirSync(dir, { recursive: true });
    writeJson(path.join(dir, 'en.json'), { key: `${name}-value` });
  });

  // Components/pages namespaces
  writeJson(path.join(messagesDir, 'components', 'shared-widget', 'en.json'), {
    heading: 'text',
  });
  writeJson(path.join(messagesDir, 'pages', 'dashboard', 'en.json'), {
    title: 'dash',
  });
  writeJson(path.join(messagesDir, 'pages', 'sign-in', 'en.json'), {
    title: 'signin',
  });

  const routingContent = `
import { defineRouting } from 'next-intl/routing';
export const routing = defineRouting({
  pathnames: {
    '/': '/',
    '/sign-in': { es: '/iniciar-sesion', en: '/sign-in' },
    '/dashboard': { es: '/tablero', en: '/dashboard' },
    '/iniciar-sesion': '/iniciar-sesion',
    '/tablero': '/tablero'
  },
  locales: ['en'],
  defaultLocale: 'en'
});
`;
  fs.writeFileSync(path.join(i18nDir, 'routing.ts'), routingContent, 'utf-8');

  return { tmp, messagesDir, i18nDir };
};

describe('generate-i18n-loaders', () => {
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
    jest.resetModules();
  });

  it('preserves manual overrides across regenerations', async () => {
    const { tmp } = makeTmpProject();
    process.chdir(tmp);

    // Seed existing generated file with manual block
    const manualBlock = `export const manualRouteOverrides: Record<string, NamespaceSelection> = {
  '/custom': publicSelection(['sharedWidget']),
};`;
    fs.writeFileSync(
      path.join(tmp, 'i18n', 'loaders.generated.ts'),
      [
        '// === MANUAL ROUTE OVERRIDES START ===',
        manualBlock,
        '// === MANUAL ROUTE OVERRIDES END ===',
      ].join('\n'),
      'utf-8',
    );

    await jest.isolateModulesAsync(async () => {
      const { generateLoaders } = await import('@/scripts/generate-i18n-loaders');
      generateLoaders();
    });

    const outputPath = path.join(process.cwd(), 'i18n', 'loaders.generated.ts');
    const output = fs.readFileSync(outputPath, 'utf-8');
    expect(output).toContain(manualBlock);
    expect(output).toContain("'/custom'");
  });

  it('generates route map for localized paths and warns when pages are missing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { tmp } = makeTmpProject();
    process.chdir(tmp);

    await jest.isolateModulesAsync(async () => {
      const { generateLoaders } = await import('@/scripts/generate-i18n-loaders');
      generateLoaders();
    });

    const outputPath = path.join(process.cwd(), 'i18n', 'loaders.generated.ts');
    const output = fs.readFileSync(outputPath, 'utf-8');

    expect(output).toContain("'/iniciar-sesion': authSelection()");
    expect(output).toContain("'/tablero': protectedSelection()");
    expect(output).toContain("'/dashboard': protectedSelection(['dashboard'])");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('iniciar-sesion'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('tablero'));
    warnSpy.mockRestore();
  });
});

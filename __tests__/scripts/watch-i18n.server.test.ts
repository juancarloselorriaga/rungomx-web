/** @jest-environment node */

const generateTypesMock = jest.fn();
const generateLoadersMock = jest.fn();
const watchInstances: {
  paths: unknown;
  options: unknown;
  watcher: { on: jest.Mock; close: jest.Mock };
}[] = [];

jest.mock('chokidar', () => {
  const watch = jest.fn((paths: unknown, options: unknown) => {
    const watcher = {
      on: jest.fn().mockReturnThis(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    watchInstances.push({
      paths,
      options,
      watcher,
    });
    return watcher;
  });

  return {
    watch,
    __watchInstances: watchInstances,
  };
});

jest.mock('../../scripts/generate-i18n-loaders', () => ({
  generateLoaders: generateLoadersMock,
}));

jest.mock('../../scripts/generate-i18n-types', () => ({
  generateTypes: generateTypesMock,
}));

describe('watch-i18n script', () => {
  beforeEach(() => {
    watchInstances.length = 0;
    generateTypesMock.mockReset();
    generateLoadersMock.mockReset();
    jest.resetModules();
  });

  it('watches JSON files and namespace directories', async () => {
    jest.isolateModules(() => {
      // Importing the script should register watchers and trigger initial generation
      require('@/scripts/watch-i18n');
    });

    const chokidar = await import('chokidar');
    const instances = (
      chokidar as unknown as {
        __watchInstances: typeof watchInstances;
      }
    ).__watchInstances;

    const watchedPaths = instances.map((instance) => instance.paths);
    expect(watchedPaths).toEqual(
      expect.arrayContaining(['messages/**/*.json', ['messages/pages', 'messages/components']]),
    );

    instances.forEach(({ watcher }) => {
      expect(watcher.on).toHaveBeenCalled();
    });

    expect(generateTypesMock).toHaveBeenCalledTimes(1);
    expect(generateLoadersMock).toHaveBeenCalledTimes(1);
  });
});

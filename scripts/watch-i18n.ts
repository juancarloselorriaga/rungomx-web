#!/usr/bin/env tsx
/**
 * i18n Watcher
 *
 * Watches message JSON files and namespace directories to regenerate
 * both types and loaders in real time.
 *
 * Usage:
 *   pnpm watch:i18n
 */

import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import { generateLoaders } from './generate-i18n-loaders';
import { generateTypes } from './generate-i18n-types';

function regenerateAll(reason?: string) {
  console.log(`\n🔄 Regenerating${reason ? ` (${reason})` : ''}...`);
  generateTypes();
  generateLoaders();
  console.log('✅ Done!\n');
}

console.log('👀 Watching messages/**/*.json and namespace directories...\n');

// Initial generation
try {
  regenerateAll('initial run');
} catch (error) {
  console.error('❌ Initial generation failed:', error);
  process.exit(1);
}

const fileWatcher: FSWatcher = chokidar.watch('messages/**/*.json', {
  ignoreInitial: true,
  persistent: true,
  awaitWriteFinish: {
    stabilityThreshold: 100,
    pollInterval: 50,
  },
});

const dirWatcher: FSWatcher = chokidar.watch(['messages/pages', 'messages/components'], {
  ignoreInitial: true,
  persistent: true,
});

const handleChange = (eventLabel: string) => (filePath: string) => {
  console.log(`\n${eventLabel} ${filePath}`);
  try {
    regenerateAll(eventLabel.trim());
  } catch (error) {
    console.error('❌ Generation failed:', error);
  }
};

fileWatcher.on('change', handleChange('📝'));
fileWatcher.on('add', handleChange('➕'));
fileWatcher.on('unlink', handleChange('🗑️'));

dirWatcher.on('addDir', handleChange('📁➕'));
dirWatcher.on('unlinkDir', handleChange('📁🗑️'));
dirWatcher.on('error', (error: unknown) => {
  console.error('❌ Directory watcher error:', error);
});

const closeWatchers = async () => {
  console.log('\n\n👋 Stopping i18n watcher...');
  await Promise.all([fileWatcher.close(), dirWatcher.close()]);
  process.exit(0);
};

fileWatcher.on('error', (error: unknown) => {
  console.error('❌ File watcher error:', error);
});

process.on('SIGINT', () => void closeWatchers());
process.on('SIGTERM', () => void closeWatchers());

console.log('✨ Ready! Edit messages or add namespaces to regenerate loaders and types.\n');

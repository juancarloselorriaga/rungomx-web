#!/usr/bin/env tsx
/**
 * i18n Type Watcher
 *
 * Watches message JSON files for changes and automatically regenerates types.
 * This provides real-time TypeScript autocomplete updates during development.
 *
 * Usage:
 *   pnpm watch:i18n-types
 */

import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import { generateTypes } from './generate-i18n-types';

console.log('👀 Watching messages/**/*.json for changes...\n');

// Initial generation
console.log('🚀 Initial type generation...');
try {
  generateTypes();
  console.log('');
} catch (error) {
  console.error('❌ Initial generation failed:', error);
  process.exit(1);
}

// Watch for changes
const watcher: FSWatcher = chokidar.watch('messages/**/*.json', {
  ignoreInitial: true,
  persistent: true,
  awaitWriteFinish: {
    stabilityThreshold: 100,
    pollInterval: 50,
  },
});

watcher.on('change', (filePath: string) => {
  console.log(`\n📝 ${filePath} changed`);
  console.log('   Regenerating types...');
  try {
    generateTypes();
  } catch (error) {
    console.error('❌ Generation failed:', error);
  }
  console.log('');
});

watcher.on('add', (filePath: string) => {
  console.log(`\n➕ ${filePath} added`);
  console.log('   Regenerating types...');
  try {
    generateTypes();
  } catch (error) {
    console.error('❌ Generation failed:', error);
  }
  console.log('');
});

watcher.on('unlink', (filePath: string) => {
  console.log(`\n🗑️  ${filePath} removed`);
  console.log('   Regenerating types...');
  try {
    generateTypes();
  } catch (error) {
    console.error('❌ Generation failed:', error);
  }
  console.log('');
});

watcher.on('error', (error: unknown) => {
  console.error('❌ Watcher error:', error);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Stopping i18n type watcher...');
  void watcher.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Stopping i18n type watcher...');
  void watcher.close();
  process.exit(0);
});

console.log('✨ Ready! Edit any message file to see types update automatically.');
console.log('   Press Ctrl+C to stop watching.\n');

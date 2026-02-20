#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

const MENU_ENTRIES = {
  pm: [
    {
      trigger: 'release-readiness',
      workflow: '{project-root}/bmad-modules/rungomx-bmm-extension/workflows/release-readiness/workflow.yaml',
      description: 'Run repo quality gates and produce GO/HOLD/NO-GO release report',
    },
    {
      trigger: 'event-publish-readiness',
      workflow: '{project-root}/bmad-modules/rungomx-bmm-extension/workflows/event-publish-readiness/workflow.yaml',
      description: 'Validate event-specific publish readiness and produce PUBLISH/HOLD/BLOCK decision',
    },
    {
      trigger: 'i18n-regression-guard',
      workflow: '{project-root}/bmad-modules/rungomx-bmm-extension/workflows/i18n-regression-guard/workflow.yaml',
      description: 'Run i18n parity and regression checks with risk classification',
    },
    {
      trigger: 'meta-delivery-radar',
      workflow: '{project-root}/bmad-modules/rungomx-bmm-extension/workflows/meta-delivery-radar/workflow.yaml',
      description: 'Generate delivery radar snapshot and route parallel follow-up lanes',
    },
  ],
  sm: [
    {
      trigger: 'release-readiness',
      workflow: '{project-root}/bmad-modules/rungomx-bmm-extension/workflows/release-readiness/workflow.yaml',
      description: 'Orchestrate full release readiness gates with team-owned evidence merge',
    },
    {
      trigger: 'event-publish-readiness',
      workflow: '{project-root}/bmad-modules/rungomx-bmm-extension/workflows/event-publish-readiness/workflow.yaml',
      description: 'Coordinate event publish preflight checks and blocker triage',
    },
    {
      trigger: 'i18n-regression-guard',
      workflow: '{project-root}/bmad-modules/rungomx-bmm-extension/workflows/i18n-regression-guard/workflow.yaml',
      description: 'Coordinate i18n regression defense sequence and fix/retest loop',
    },
    {
      trigger: 'meta-delivery-radar',
      workflow: '{project-root}/bmad-modules/rungomx-bmm-extension/workflows/meta-delivery-radar/workflow.yaml',
      description: 'Drive parallel PM/Ops/Dev/QA/Platform lanes from delivery radar',
    },
  ],
};

const TARGETS = [
  {
    key: 'pm',
    relPath: '_bmad/_config/agents/bmm-pm.customize.yaml',
  },
  {
    key: 'sm',
    relPath: '_bmad/_config/agents/bmm-sm.customize.yaml',
  },
];

function printUsage() {
  const lines = [
    'Usage:',
    '  node bmad-modules/rungomx-bmm-extension/tools/apply-menu-customizations.mjs [options]',
    '',
    'Options:',
    '  --project-root <path>  Project root (default: current working directory)',
    '  --dry-run              Print planned changes without writing files',
    '  -h, --help             Show this message',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

function resolveOptions() {
  const parsed = parseArgs({
    options: {
      'project-root': { type: 'string' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: false,
    strict: true,
  });

  if (parsed.values.help) {
    printUsage();
    process.exit(0);
  }

  return {
    projectRoot: path.resolve(parsed.values['project-root'] ?? process.cwd()),
    dryRun: Boolean(parsed.values['dry-run']),
  };
}

function renderMenuBlock(entries) {
  const lines = ['menu:'];
  for (const entry of entries) {
    lines.push(`  - trigger: ${entry.trigger}`);
    lines.push(`    workflow: "${entry.workflow}"`);
    lines.push(`    description: ${entry.description}`);
  }
  return lines.join('\n');
}

function hasAllEntries(content, entries) {
  return entries.every((entry) => content.includes(`trigger: ${entry.trigger}`));
}

function applyEntries(content, entries) {
  if (hasAllEntries(content, entries)) {
    return { changed: false, updated: content };
  }

  const renderedBlock = renderMenuBlock(entries);

  if (content.includes('menu: []')) {
    return {
      changed: true,
      updated: content.replace('menu: []', renderedBlock),
    };
  }

  const menuAnchor = '\nmenu:\n';
  const exampleAnchor = '\n# Example:';
  const menuStart = content.indexOf(menuAnchor);
  const exampleStart = content.indexOf(exampleAnchor);

  if (menuStart !== -1 && exampleStart !== -1 && exampleStart > menuStart) {
    const before = content.slice(0, menuStart + menuAnchor.length);
    const after = content.slice(exampleStart);
    const items = renderedBlock.split('\n').slice(1).join('\n');
    const updated = `${before}${items}\n${after}`;
    return { changed: true, updated };
  }

  const appended = `${content.trimEnd()}\n\n${renderedBlock}\n`;
  return { changed: true, updated: appended };
}

async function processTarget(projectRoot, target, dryRun) {
  const filePath = path.join(projectRoot, target.relPath);
  const entries = MENU_ENTRIES[target.key];

  let content;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    process.stderr.write(`[menu-customize] Missing file: ${target.relPath} (${error.message})\n`);
    return { filePath, changed: false, missing: true };
  }

  const result = applyEntries(content, entries);
  if (!result.changed) {
    process.stdout.write(`[menu-customize] No change: ${target.relPath}\n`);
    return { filePath, changed: false, missing: false };
  }

  if (dryRun) {
    process.stdout.write(`[menu-customize] Would update: ${target.relPath}\n`);
    return { filePath, changed: true, missing: false };
  }

  await writeFile(filePath, result.updated, 'utf8');
  process.stdout.write(`[menu-customize] Updated: ${target.relPath}\n`);
  return { filePath, changed: true, missing: false };
}

async function main() {
  const options = resolveOptions();

  const results = [];
  for (const target of TARGETS) {
    // Keep deterministic ordering for stable output.
    const result = await processTarget(options.projectRoot, target, options.dryRun);
    results.push(result);
  }

  const missing = results.filter((item) => item.missing).length;
  const changed = results.filter((item) => item.changed).length;
  process.stdout.write(
    `[menu-customize] Done. changed=${changed}, missing=${missing}, dryRun=${options.dryRun}\n`,
  );

  if (missing > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`[menu-customize] Error: ${error.message}\n`);
  process.exit(1);
});

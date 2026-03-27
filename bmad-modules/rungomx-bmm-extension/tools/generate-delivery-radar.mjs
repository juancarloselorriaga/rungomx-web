#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

const STRICT_THRESHOLD = 70;
const DEFAULT_SPRINT_STATUS_PATH = '_bmad-output/implementation-artifacts/sprint-status.yaml';
const DEFAULT_OUT_DIR = '_bmad-output/implementation-artifacts/meta';

const SCRIPT_SIGNAL_CHECKS = [
  { id: 'build', label: 'Build script', match: (name) => name === 'build' },
  { id: 'lint', label: 'Lint script', match: (name) => name === 'lint' },
  { id: 'type-check', label: 'Type-check script', match: (name) => name === 'type-check' || name === 'typecheck' },
  { id: 'test', label: 'Primary test script', match: (name) => name === 'test' },
  { id: 'test:e2e', label: 'E2E test script', match: (name) => name === 'test:e2e' || name.startsWith('test:e2e:') },
  { id: 'test:ci', label: 'CI test script', match: (name) => name === 'test:ci' || name.startsWith('test:ci:') },
];

function printUsage() {
  const usage = [
    'Usage:',
    '  node bmad-modules/rungomx-bmm-extension/tools/generate-delivery-radar.mjs [options]',
    '',
    'Options:',
    '  --project-root <path>  Project root to analyze (default: current working directory)',
    '  --out-dir <path>       Output directory for delivery-radar.json/md (default: _bmad-output/implementation-artifacts/meta)',
    `  --strict               Exit with non-zero code if readiness score is below ${STRICT_THRESHOLD}`,
    '  -h, --help             Show this help message',
  ];

  process.stdout.write(`${usage.join('\n')}\n`);
}

function resolveCliOptions() {
  const parsed = parseArgs({
    options: {
      'project-root': { type: 'string' },
      'out-dir': { type: 'string' },
      strict: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: false,
    strict: true,
  });

  if (parsed.values.help) {
    printUsage();
    process.exit(0);
  }

  const projectRoot = path.resolve(parsed.values['project-root'] ?? process.cwd());
  const outDirInput = parsed.values['out-dir'];
  const outDir = outDirInput
    ? (path.isAbsolute(outDirInput) ? outDirInput : path.resolve(projectRoot, outDirInput))
    : path.join(projectRoot, DEFAULT_OUT_DIR);

  return {
    projectRoot,
    outDir,
    strict: Boolean(parsed.values.strict),
  };
}

function normalizeStatus(value) {
  return String(value ?? '').trim().toLowerCase();
}

function incrementCount(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

function sortedCountMap(input) {
  const entries = Object.entries(input).sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries);
}

function stripInlineComment(input) {
  const hashIndex = input.indexOf('#');
  if (hashIndex === -1) {
    return input.trim();
  }

  return input.slice(0, hashIndex).trim();
}

function parseSprintStatusYaml(rawYaml) {
  const lines = rawYaml.split(/\r?\n/);
  const meta = {};
  const developmentStatus = {};
  let inDevelopmentStatus = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const indentation = rawLine.match(/^\s*/u)?.[0].length ?? 0;

    if (!inDevelopmentStatus) {
      if (trimmed === 'development_status:') {
        inDevelopmentStatus = true;
        continue;
      }

      if (indentation === 0) {
        const keyValueMatch = trimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/u);
        if (keyValueMatch) {
          meta[keyValueMatch[1]] = stripInlineComment(keyValueMatch[2]);
        }
      }

      continue;
    }

    if (indentation === 0) {
      inDevelopmentStatus = false;
      const keyValueMatch = trimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/u);
      if (keyValueMatch) {
        meta[keyValueMatch[1]] = stripInlineComment(keyValueMatch[2]);
      }
      continue;
    }

    const statusMatch = rawLine.match(/^\s{2}([^:]+):\s*(.*?)\s*$/u);
    if (!statusMatch) {
      continue;
    }

    const itemKey = statusMatch[1].trim();
    const statusValue = normalizeStatus(stripInlineComment(statusMatch[2]));
    if (itemKey) {
      developmentStatus[itemKey] = statusValue;
    }
  }

  return { meta, developmentStatus };
}

function classifyItemType(itemKey) {
  if (/-retrospective$/u.test(itemKey)) {
    return 'retrospective';
  }
  if (/^epic-\d+$/u.test(itemKey)) {
    return 'epic';
  }
  return 'story';
}

function computeStatusSummary(developmentStatus) {
  const overallCounts = {};
  const byType = {
    epic: { total: 0, counts: {} },
    story: { total: 0, counts: {} },
    retrospective: { total: 0, counts: {} },
  };

  for (const [itemKey, statusValue] of Object.entries(developmentStatus)) {
    const normalizedStatus = normalizeStatus(statusValue);
    const itemType = classifyItemType(itemKey);

    byType[itemType].total += 1;
    incrementCount(byType[itemType].counts, normalizedStatus);
    incrementCount(overallCounts, normalizedStatus);
  }

  return {
    totalItems: Object.keys(developmentStatus).length,
    counts: sortedCountMap(overallCounts),
    byType: {
      epic: { total: byType.epic.total, counts: sortedCountMap(byType.epic.counts) },
      story: { total: byType.story.total, counts: sortedCountMap(byType.story.counts) },
      retrospective: { total: byType.retrospective.total, counts: sortedCountMap(byType.retrospective.counts) },
    },
  };
}

function computeScriptSignals(scripts) {
  const scriptNames = Object.keys(scripts).sort((left, right) => left.localeCompare(right));
  const checks = SCRIPT_SIGNAL_CHECKS.map((check) => {
    const matchedScripts = scriptNames.filter((name) => check.match(name));
    return {
      id: check.id,
      label: check.label,
      present: matchedScripts.length > 0,
      matchedScripts,
    };
  });

  const presentCount = checks.filter((check) => check.present).length;
  const coveragePct = checks.length === 0 ? 0 : Math.round((presentCount / checks.length) * 100);
  const missingSignals = checks.filter((check) => !check.present).map((check) => check.id);

  return {
    totalScripts: scriptNames.length,
    scriptNames,
    checks,
    coveragePct,
    missingSignals,
  };
}

function parseGeneratedDate(rawValue) {
  if (!rawValue) {
    return null;
  }

  const input = String(rawValue).trim();
  if (!input) {
    return null;
  }

  const exactMinutePattern = /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/u;
  const normalizedInput = exactMinutePattern.test(input) ? `${input.replace(' ', 'T')}:00` : input;
  const parsed = new Date(normalizedInput);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function computeFreshness(generatedRaw) {
  const sourceGeneratedDate = parseGeneratedDate(generatedRaw);
  if (!sourceGeneratedDate) {
    return {
      sourceGeneratedAt: generatedRaw || null,
      ageHours: null,
      ageDays: null,
      level: 'unknown',
      score: 0,
    };
  }

  const now = new Date();
  const ageMs = Math.max(0, now.getTime() - sourceGeneratedDate.getTime());
  const ageHours = round(ageMs / (1000 * 60 * 60), 2);
  const ageDays = round(ageHours / 24, 2);

  if (ageHours <= 24) {
    return {
      sourceGeneratedAt: sourceGeneratedDate.toISOString(),
      ageHours,
      ageDays,
      level: 'fresh',
      score: 100,
    };
  }

  if (ageHours <= 72) {
    return {
      sourceGeneratedAt: sourceGeneratedDate.toISOString(),
      ageHours,
      ageDays,
      level: 'warm',
      score: 85,
    };
  }

  if (ageHours <= 168) {
    return {
      sourceGeneratedAt: sourceGeneratedDate.toISOString(),
      ageHours,
      ageDays,
      level: 'aging',
      score: 65,
    };
  }

  return {
    sourceGeneratedAt: sourceGeneratedDate.toISOString(),
    ageHours,
    ageDays,
    level: 'stale',
    score: 35,
  };
}

function statusCount(summary, typeKey, statusKey) {
  if (typeKey === 'overall') {
    return summary.counts[statusKey] ?? 0;
  }

  return summary.byType[typeKey]?.counts?.[statusKey] ?? 0;
}

function completionPct(doneCount, totalCount) {
  if (totalCount === 0) {
    return 0;
  }
  return Math.round((doneCount / totalCount) * 100);
}

function computeMetrics(statusSummary, scriptSignals, freshness) {
  const storyTotal = statusSummary.byType.story.total;
  const epicTotal = statusSummary.byType.epic.total;
  const storyDone = statusCount(statusSummary, 'story', 'done');
  const epicDone = statusCount(statusSummary, 'epic', 'done');
  const storyInFlight =
    statusCount(statusSummary, 'story', 'in-progress') +
    statusCount(statusSummary, 'story', 'review') +
    statusCount(statusSummary, 'story', 'ready-for-dev');
  const storyBacklog = statusCount(statusSummary, 'story', 'backlog');

  const storyCompletion = completionPct(storyDone, storyTotal);
  const epicCompletion = completionPct(epicDone, epicTotal);
  const readinessScore = Math.round(
    storyCompletion * 0.45 +
      epicCompletion * 0.15 +
      scriptSignals.coveragePct * 0.25 +
      freshness.score * 0.15,
  );

  return {
    storyTotal,
    storyDone,
    storyInFlight,
    storyBacklog,
    storyCompletionPct: storyCompletion,
    epicTotal,
    epicDone,
    epicCompletionPct: epicCompletion,
    scriptCoveragePct: scriptSignals.coveragePct,
    freshnessScore: freshness.score,
    readinessScore,
    strictThreshold: STRICT_THRESHOLD,
  };
}

function buildRecommendations(statusSummary, scriptSignals, freshness, metrics) {
  const recommendations = [];

  if (freshness.level === 'aging' || freshness.level === 'stale' || freshness.level === 'unknown') {
    recommendations.push('Refresh sprint-status.yaml before planning the next delivery cycle.');
  }

  if (metrics.storyBacklog > 0) {
    recommendations.push(`Prioritize backlog stories: ${metrics.storyBacklog} story item(s) remain in backlog.`);
  }

  if (metrics.storyInFlight > 0) {
    recommendations.push(
      `Stabilize in-flight stories: ${metrics.storyInFlight} story item(s) are ready-for-dev, in-progress, or review.`,
    );
  }

  if (scriptSignals.missingSignals.length > 0) {
    recommendations.push(
      `Add missing package script signals: ${scriptSignals.missingSignals.join(', ')}.`,
    );
  }

  const optionalRetrospectives = statusCount(statusSummary, 'retrospective', 'optional');
  if (optionalRetrospectives > 0) {
    recommendations.push(`Complete pending retrospectives where useful: ${optionalRetrospectives} marked optional.`);
  }

  if (metrics.readinessScore < STRICT_THRESHOLD) {
    recommendations.push(
      `Readiness score is below threshold (${metrics.readinessScore} < ${STRICT_THRESHOLD}); trigger focused recovery actions.`,
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('Delivery posture is healthy; keep cadence and monitor regressions.');
  }

  return recommendations;
}

function renderCountsRows(counts) {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return '| (none) | 0 |';
  }

  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `| ${status} | ${count} |`)
    .join('\n');
}

function renderMarkdown(radar) {
  const statusKeys = ['done', 'review', 'in-progress', 'ready-for-dev', 'backlog', 'optional'];
  const byTypeRows = ['epic', 'story', 'retrospective']
    .map((type) => {
      const stats = radar.status.byType[type];
      const values = statusKeys.map((statusKey) => String(stats.counts[statusKey] ?? 0));
      return `| ${type} | ${stats.total} | ${values.join(' | ')} |`;
    })
    .join('\n');

  const checkRows = radar.scripts.checks
    .map((check) => {
      const matchedScripts = check.matchedScripts.length > 0 ? check.matchedScripts.join(', ') : '-';
      return `| ${check.id} | ${check.present ? 'yes' : 'no'} | ${matchedScripts} |`;
    })
    .join('\n');

  const recommendationRows = radar.recommendations.map((item, index) => `${index + 1}. ${item}`).join('\n');

  return [
    '# Delivery Radar',
    '',
    `- Generated At: ${radar.generatedAt}`,
    `- Project Root: \`${radar.projectRoot}\``,
    `- Sprint Status File: \`${radar.inputs.sprintStatusFile}\``,
    '',
    '## Readiness',
    '',
    `- Readiness Score: **${radar.metrics.readinessScore}/100**`,
    `- Strict Threshold: ${radar.metrics.strictThreshold}`,
    `- Strict Result: ${radar.metrics.readinessScore >= radar.metrics.strictThreshold ? 'PASS' : 'FAIL'}`,
    '',
    '## Freshness',
    '',
    `- Source Generated At: ${radar.freshness.sourceGeneratedAt ?? 'unknown'}`,
    `- Age (hours): ${radar.freshness.ageHours ?? 'unknown'}`,
    `- Age (days): ${radar.freshness.ageDays ?? 'unknown'}`,
    `- Freshness Level: ${radar.freshness.level}`,
    `- Freshness Score: ${radar.freshness.score}`,
    '',
    '## Status Counts (Overall)',
    '',
    '| Status | Count |',
    '| --- | ---: |',
    renderCountsRows(radar.status.counts),
    '',
    '## Status Counts (By Type)',
    '',
    '| Type | Total | done | review | in-progress | ready-for-dev | backlog | optional |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    byTypeRows,
    '',
    '## Script Signals',
    '',
    `- Total Scripts: ${radar.scripts.totalScripts}`,
    `- Coverage: ${radar.scripts.coveragePct}%`,
    `- Missing Signals: ${radar.scripts.missingSignals.length > 0 ? radar.scripts.missingSignals.join(', ') : 'none'}`,
    '',
    '| Signal | Present | Matched Scripts |',
    '| --- | --- | --- |',
    checkRows,
    '',
    '## Follow-up Actions',
    '',
    recommendationRows,
    '',
  ].join('\n');
}

async function readPackageScripts(packageJsonPath) {
  const rawPackageJson = await readFile(packageJsonPath, 'utf8');
  let parsedPackageJson;
  try {
    parsedPackageJson = JSON.parse(rawPackageJson);
  } catch (error) {
    throw new Error(`Invalid package.json at ${packageJsonPath}: ${error.message}`);
  }

  const scripts = parsedPackageJson.scripts;
  if (!scripts || typeof scripts !== 'object') {
    return {};
  }

  return scripts;
}

async function buildDeliveryRadar(options) {
  const packageJsonPath = path.join(options.projectRoot, 'package.json');
  const sprintStatusPath = path.join(options.projectRoot, DEFAULT_SPRINT_STATUS_PATH);

  const scripts = await readPackageScripts(packageJsonPath);
  const sprintStatusRaw = await readFile(sprintStatusPath, 'utf8');
  const parsedSprintStatus = parseSprintStatusYaml(sprintStatusRaw);
  const statusSummary = computeStatusSummary(parsedSprintStatus.developmentStatus);
  const scriptSignals = computeScriptSignals(scripts);
  const freshness = computeFreshness(parsedSprintStatus.meta.generated);
  const metrics = computeMetrics(statusSummary, scriptSignals, freshness);
  const recommendations = buildRecommendations(statusSummary, scriptSignals, freshness, metrics);

  return {
    generatedAt: new Date().toISOString(),
    projectRoot: options.projectRoot,
    inputs: {
      packageJsonFile: packageJsonPath,
      sprintStatusFile: sprintStatusPath,
    },
    sprintStatusMeta: parsedSprintStatus.meta,
    freshness,
    status: statusSummary,
    scripts: scriptSignals,
    metrics,
    recommendations,
  };
}

async function writeOutputs(radar, outDir) {
  await mkdir(outDir, { recursive: true });

  const jsonPath = path.join(outDir, 'delivery-radar.json');
  const markdownPath = path.join(outDir, 'delivery-radar.md');
  const markdown = renderMarkdown(radar);

  await writeFile(jsonPath, `${JSON.stringify(radar, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, markdown, 'utf8');

  return { jsonPath, markdownPath };
}

async function main() {
  const options = resolveCliOptions();
  const radar = await buildDeliveryRadar(options);
  const outputPaths = await writeOutputs(radar, options.outDir);

  process.stdout.write(`[delivery-radar] Wrote ${outputPaths.jsonPath}\n`);
  process.stdout.write(`[delivery-radar] Wrote ${outputPaths.markdownPath}\n`);
  process.stdout.write(`[delivery-radar] Readiness score: ${radar.metrics.readinessScore}/100\n`);

  if (options.strict && radar.metrics.readinessScore < STRICT_THRESHOLD) {
    process.stderr.write(
      `[delivery-radar] Strict mode failed: readiness score ${radar.metrics.readinessScore} is below ${STRICT_THRESHOLD}.\n`,
    );
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`[delivery-radar] Error: ${error.message}\n`);
  process.exit(1);
});

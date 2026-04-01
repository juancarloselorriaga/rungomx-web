import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

type Options = {
  title: string;
  taskId?: string;
  phase?: string;
  canonicalDocs: string[];
  canonicalDocsProvided: boolean;
  plan?: string;
  checkpoint?: string;
  nextStep?: string;
  touchpoints: string[];
  scratchDir: string;
  force: boolean;
};

const DEFAULT_SCRATCH_DIR = '.tmp/opencode-phased-memory';
const DEFAULT_CANONICAL_DOCS = [
  'AGENTS.md',
  'prompts/standards/README.md',
  'prompts/meta/phased-orchestration-memory-protocol.md',
];
const TEMPLATE_PATH = '.opencode/support/phased-memory/deep-memory-template.md';

function printUsage() {
  console.log(`Usage:
  pnpm opencode:phased-memory:init --title "Task title" [options]

Options:
  --title <value>         Required task title
  --task-id <value>       Stable task id or slug
  --phase <value>         Active phase label
  --canonical <path>      Canonical doc path (repeatable)
  --plan <path>           Active plan/spec path
  --checkpoint <value>    Last verified checkpoint name
  --next-step <value>     Next safe step summary
  --touchpoint <path>     Touched surface/module/path (repeatable)
  --scratch-dir <path>    Non-tracked scratch directory (default: ${DEFAULT_SCRATCH_DIR})
  --force                 Refresh an existing artifact without discarding untouched fields
  --help                  Show this message
`);
}

function sanitizeSlug(value: string) {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return sanitized || 'phased-task';
}

function toRepoRelative(absolutePath: string) {
  const relativePath = path.relative(process.cwd(), absolutePath);
  return relativePath && !relativePath.startsWith('..') ? relativePath : absolutePath;
}

function replaceField(content: string, label: string, value: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^- ${escaped}:.*$`, 'm');
  return content.replace(pattern, `- ${label}: ${value}`);
}

function parseFieldMap(content: string) {
  const fieldMap = new Map<string, string>();
  const matches = content.matchAll(/^- ([^:]+):(.*)$/gm);

  for (const match of matches) {
    const label = match[1]?.trim();
    const value = match[2]?.trim() ?? '';
    if (label) {
      fieldMap.set(label, value);
    }
  }

  return fieldMap;
}

function getExistingValue(fieldMap: Map<string, string>, label: string) {
  return fieldMap.get(label) ?? '';
}

function isInsideWorkspace(targetPath: string) {
  const relativePath = path.relative(process.cwd(), targetPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function isWithinRoot(targetPath: string, rootPath: string) {
  const relativePath = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function ensureSafeScratchLocation(targetPath: string) {
  if (!isInsideWorkspace(targetPath)) {
    if (!isWithinRoot(targetPath, os.tmpdir())) {
      throw new Error(
        `External scratch directory is not an approved runtime scratch root: ${targetPath}. ` +
          `Use a path under ${os.tmpdir()} or an ignored workspace-local area. If no safe location is available, stay in lightweight mode.`,
      );
    }

    fs.mkdirSync(targetPath, { recursive: true });
    return;
  }

  const probePath = path.resolve(targetPath, '.phased-memory-ignore-probe');

  try {
    execFileSync('git', ['check-ignore', '-q', probePath], {
      cwd: process.cwd(),
      stdio: 'ignore',
    });
  } catch {
    throw new Error(
      `Scratch directory is not a verified non-tracked location: ${toRepoRelative(targetPath)}. ` +
        'Choose an ignored workspace-local area or runtime scratch. If no safe location is available, stay in lightweight mode.',
    );
  }

  fs.mkdirSync(targetPath, { recursive: true });
}

function parseArgs(argv: string[]): Options | null {
  const options: Options = {
    title: '',
    canonicalDocs: [...DEFAULT_CANONICAL_DOCS],
    canonicalDocsProvided: false,
    touchpoints: [],
    scratchDir: DEFAULT_SCRATCH_DIR,
    force: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
      printUsage();
      return null;
    }

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }

    switch (arg) {
      case '--title':
        options.title = value;
        break;
      case '--task-id':
        options.taskId = value;
        break;
      case '--phase':
        options.phase = value;
        break;
      case '--canonical':
        if (!options.canonicalDocsProvided) {
          options.canonicalDocs = [...DEFAULT_CANONICAL_DOCS];
          options.canonicalDocsProvided = true;
        }
        if (!options.canonicalDocs.includes(value)) {
          options.canonicalDocs.push(value);
        }
        break;
      case '--plan':
        options.plan = value;
        break;
      case '--checkpoint':
        options.checkpoint = value;
        break;
      case '--next-step':
        options.nextStep = value;
        break;
      case '--touchpoint':
        options.touchpoints.push(value);
        break;
      case '--scratch-dir':
        options.scratchDir = value;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }

    index += 1;
  }

  if (!options.title.trim()) {
    throw new Error('The --title option is required.');
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options) return;

  const templatePath = path.resolve(process.cwd(), TEMPLATE_PATH);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Deep-memory template not found: ${templatePath}`);
  }

  const scratchDir = path.resolve(process.cwd(), options.scratchDir);
  ensureSafeScratchLocation(scratchDir);

  const taskSlug = sanitizeSlug(options.taskId ?? options.title);
  const artifactPath = path.resolve(scratchDir, `${taskSlug}.md`);
  const existed = fs.existsSync(artifactPath);

  if (existed && !options.force) {
    throw new Error(
      `Artifact already exists: ${toRepoRelative(artifactPath)} (use --force to overwrite)`,
    );
  }

  const now = new Date().toISOString();
  let content = existed
    ? fs.readFileSync(artifactPath, 'utf8')
    : fs.readFileSync(templatePath, 'utf8');
  const existingFieldMap = existed
    ? parseFieldMap(fs.readFileSync(artifactPath, 'utf8'))
    : new Map<string, string>();

  const canonicalDocs = options.canonicalDocsProvided
    ? options.canonicalDocs
    : (() => {
        const existingDocs = getExistingValue(existingFieldMap, 'Canonical docs');
        return existingDocs
          ? existingDocs
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : options.canonicalDocs;
      })();

  const touchpoints =
    options.touchpoints.length > 0
      ? options.touchpoints
      : (() => {
          const existingTouchpoints = getExistingValue(
            existingFieldMap,
            'Touched surfaces or modules',
          );
          return existingTouchpoints
            ? existingTouchpoints
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)
            : options.touchpoints;
        })();

  const activePlan = options.plan ?? getExistingValue(existingFieldMap, 'Active plan or spec');
  const activePhase = options.phase ?? getExistingValue(existingFieldMap, 'Active phase');
  const checkpointName =
    (options.checkpoint ?? getExistingValue(existingFieldMap, 'Checkpoint name')) ||
    'artifact instantiated';
  const verifiedAgainstRepoState =
    getExistingValue(existingFieldMap, 'Verified against repo state') || 'pending';
  const summary =
    getExistingValue(existingFieldMap, 'Summary') ||
    'Artifact instantiated from support template; reconcile against live repo state before use.';
  const completedOutcomes = getExistingValue(
    existingFieldMap,
    'Actual outcomes from completed work',
  );
  const activeConstraints = getExistingValue(
    existingFieldMap,
    'Constraints or assumptions now active',
  );
  const nextSafeStep =
    (options.nextStep ?? getExistingValue(existingFieldMap, 'Next safe step')) ||
    'Inspect repo state, lock the current phase, and update this artifact at the next stable checkpoint.';
  const detailedPlanLock =
    getExistingValue(existingFieldMap, 'Detailed plan lock') ||
    (options.checkpoint ? 'yes' : 'pending');
  const rereads =
    getExistingValue(existingFieldMap, 'Smallest required rereads') ||
    'Follow `AGENTS.md` startup policy first, then load only the smallest additional canonical sections needed for the active phase.';

  content = replaceField(content, 'Task id', options.taskId ?? taskSlug);
  content = replaceField(content, 'Task title', options.title.trim());
  content = replaceField(content, 'Artifact path', toRepoRelative(artifactPath));
  content = replaceField(content, 'Last updated', now);
  content = replaceField(content, 'Canonical docs', canonicalDocs.join(', '));
  content = replaceField(content, 'Active plan or spec', activePlan);
  content = replaceField(content, 'Active phase', activePhase);
  content = replaceField(content, 'Checkpoint name', checkpointName);
  content = replaceField(content, 'Verified against repo state', verifiedAgainstRepoState);
  content = replaceField(content, 'Summary', summary);
  content = replaceField(content, 'Actual outcomes from completed work', completedOutcomes);
  content = replaceField(content, 'Constraints or assumptions now active', activeConstraints);
  content = replaceField(content, 'Touched surfaces or modules', touchpoints.join(', '));
  content = replaceField(content, 'Next safe step', nextSafeStep);
  content = replaceField(content, 'Detailed plan lock', detailedPlanLock);
  content = replaceField(content, 'Smallest required rereads', rereads);

  fs.writeFileSync(artifactPath, content);

  console.log(
    `${existed ? 'Updated' : 'Created'} deep-memory artifact: ${toRepoRelative(artifactPath)}`,
  );
  console.log(
    'Reminder: store phased memory only in non-tracked scratch space and reconcile it against live repo state before use.',
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(message);
  process.exit(1);
}

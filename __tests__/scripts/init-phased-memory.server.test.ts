import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const repoRoot = path.resolve(__dirname, '../..');
const scriptPath = path.resolve(repoRoot, 'scripts/init-phased-memory.ts');
const templatePath = path.resolve(
  repoRoot,
  '.opencode/support/phased-memory/deep-memory-template.md',
);

function runScript(args: string[], options?: { expectFailure?: boolean }) {
  const baseCommand = ['--import', 'tsx', scriptPath, ...args];

  try {
    const stdout = execFileSync('node', baseCommand, {
      cwd: repoRoot,
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (options?.expectFailure) {
      throw new Error('Expected command to fail, but it succeeded.');
    }

    return { stdout, stderr: '' };
  } catch (error) {
    if (!options?.expectFailure) {
      throw error;
    }

    const childError = error as { stderr?: Buffer | string; stdout?: Buffer | string };
    const stderr = String(childError.stderr ?? '');
    const stdout = String(childError.stdout ?? '');
    return { stdout, stderr };
  }
}

describe('init-phased-memory script', () => {
  let scratchRoot: string;

  beforeEach(() => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phased-memory-script-'));
  });

  afterEach(() => {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  it('creates a deep-memory artifact under approved runtime scratch', () => {
    const scratchDir = path.join(scratchRoot, 'artifacts');

    const result = runScript([
      '--title',
      'Runtime Scratch Task',
      '--task-id',
      'runtime-scratch-task',
      '--scratch-dir',
      scratchDir,
      '--phase',
      'Phase 1',
      '--checkpoint',
      'phase-1-lock',
      '--touchpoint',
      'prompts/meta/phased-orchestration-memory-protocol.md',
    ]);

    const artifactPath = path.join(scratchDir, 'runtime-scratch-task.md');
    const content = fs.readFileSync(artifactPath, 'utf8');

    expect(result.stdout).toContain('Created deep-memory artifact');
    expect(content).toContain('Task title: Runtime Scratch Task');
    expect(content).toContain('Checkpoint name: phase-1-lock');
    expect(content).toContain('AGENTS.md');
  });

  it('rejects unsafe workspace-local scratch paths', () => {
    const unsafeScratchDir = path.resolve(
      repoRoot,
      '.opencode/support/phased-memory-test-artifacts',
    );

    const result = runScript(
      ['--title', 'Unsafe Workspace Task', '--scratch-dir', unsafeScratchDir],
      { expectFailure: true },
    );

    expect(result.stderr).toContain('not a verified non-tracked location');
    expect(fs.existsSync(unsafeScratchDir)).toBe(false);
  });

  it('rejects arbitrary external directories outside runtime scratch roots', () => {
    const unsafeExternalRoot = fs.mkdtempSync(
      path.join(os.homedir(), 'unsafe-phased-memory-external-'),
    );
    const unsafeExternalDir = path.join(unsafeExternalRoot, 'artifacts');

    try {
      const result = runScript(
        ['--title', 'Unsafe External Task', '--scratch-dir', unsafeExternalDir],
        { expectFailure: true },
      );

      expect(result.stderr).toContain('not an approved runtime scratch root');
      expect(fs.existsSync(unsafeExternalDir)).toBe(false);
    } finally {
      fs.rmSync(unsafeExternalRoot, { recursive: true, force: true });
    }
  });

  it('preserves canonical docs on force refresh when none are provided', () => {
    const scratchDir = path.join(scratchRoot, 'refresh-artifacts');

    runScript([
      '--title',
      'Refresh Task',
      '--task-id',
      'refresh-task',
      '--scratch-dir',
      scratchDir,
      '--canonical',
      'plans/event-ai-wizard-bmad-execution-plan.md',
      '--canonical',
      'plans/event-ai-wizard-bmad-prompt-pack.md',
      '--checkpoint',
      'phase-1-lock',
    ]);

    runScript([
      '--title',
      'Refresh Task',
      '--task-id',
      'refresh-task',
      '--scratch-dir',
      scratchDir,
      '--phase',
      'Phase 2',
      '--force',
    ]);

    const artifactPath = path.join(scratchDir, 'refresh-task.md');
    const content = fs.readFileSync(artifactPath, 'utf8');

    expect(content).toContain('plans/event-ai-wizard-bmad-execution-plan.md');
    expect(content).toContain('plans/event-ai-wizard-bmad-prompt-pack.md');
    expect(content).toContain('Active phase: Phase 2');
  });

  it('rejects duplicate artifact creation without force', () => {
    const scratchDir = path.join(scratchRoot, 'duplicate-artifacts');

    runScript([
      '--title',
      'Duplicate Guard Task',
      '--task-id',
      'duplicate-guard-task',
      '--scratch-dir',
      scratchDir,
    ]);

    const result = runScript(
      [
        '--title',
        'Duplicate Guard Task',
        '--task-id',
        'duplicate-guard-task',
        '--scratch-dir',
        scratchDir,
      ],
      { expectFailure: true },
    );

    expect(result.stderr).toContain('Artifact already exists');
  });

  it('uses the support template structure expected by the helper', () => {
    const content = fs.readFileSync(templatePath, 'utf8');

    expect(content).toContain('## Completed Outcomes To Respect');
    expect(content).toContain('- Actual outcomes from completed work:');
    expect(content).toContain('- Constraints or assumptions now active:');
  });
});

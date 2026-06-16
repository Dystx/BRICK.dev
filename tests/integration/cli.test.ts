import { describe, expect, it, beforeAll, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { BaselineCache, ProjectReport } from '../../src/types';
import { DEFAULT_CONFIG } from '../../src/config';
import { hashConfig } from '../../src/engine/cache';
import { serializeConfig } from '../../src/index';
import {
  assertDistBuilt,
  binPath,
  cleanupTempDir,
  createTmpDir,
  execFileAsync,
  run,
} from '../helpers/cli';

function writeSloppyProject(dir: string): void {
  const srcDir = join(dir, 'src');
  mkdirSync(srcDir, { recursive: true });

  writeFileSync(
    join(srcDir, 'AiSlop.tsx'),
    `export function AiSlop() {
  return (
    <div>
      <div className="w-[100px] flex items-center justify-center min-h-screen text-center">one</div>
      <div className="h-[50px] flex items-center justify-center min-h-screen text-center">two</div>
    </div>
  );
}
`,
  );

  const buttons = Array.from({ length: 6 }, (_, i) => `      <button className="outline-none" key={${i}}>btn${i}</button>`).join('\n');
  writeFileSync(
    join(srcDir, 'WcagSlop.tsx'),
    `export function WcagSlop() {
  return (
    <div>
${buttons}
    </div>
  );
}
`,
  );
}

function writeGitRepo(dir: string): void {
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'Button.tsx'), 'export function Button() { return <button>hi</button>; }');
}

beforeAll(assertDistBuilt);

describe('init command', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('creates slop-audit.config.mjs with --yes', async () => {
    const { exitCode, stdout } = await run(['init', '--yes', '--workspace', dir]);
    expect(exitCode).toBe(0);
    const configPath = join(dir, 'slop-audit.config.mjs');
    expect(existsSync(configPath)).toBe(true);
    const content = readFileSync(configPath, 'utf8');
    expect(content).toContain('export default');
    expect(content).toContain('"thresholds"');
    expect(stdout).toContain(`Created ${configPath}`);
  });

  it('appends .slop-audit/ to .gitignore on init', async () => {
    const gitignorePath = join(dir, '.gitignore');
    writeFileSync(gitignorePath, 'node_modules/\n');
    const { exitCode } = await run(['init', '--yes', '--workspace', dir]);
    expect(exitCode).toBe(0);
    const gitignore = readFileSync(gitignorePath, 'utf8');
    expect(gitignore).toContain('.slop-audit/');
  });

  it('creates .gitignore with .slop-audit/ when none exists', async () => {
    const gitignorePath = join(dir, '.gitignore');
    const { exitCode } = await run(['init', '--yes', '--workspace', dir]);
    expect(exitCode).toBe(0);
    expect(existsSync(gitignorePath)).toBe(true);
    expect(readFileSync(gitignorePath, 'utf8')).toContain('.slop-audit/');
  });

  it('creates config and baseline with --yes --baseline', async () => {
    writeGitRepo(dir);
    await execFileAsync('git', ['init'], { cwd: dir });

    const { exitCode } = await run(['init', '--yes', '--baseline', '--workspace', dir]);
    expect(exitCode).toBe(0);
    expect(existsSync(join(dir, 'slop-audit.config.mjs'))).toBe(true);

    const baselineFile = join(dir, '.slop-audit', 'cache', 'baseline.json');
    expect(existsSync(baselineFile)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')) as Record<string, unknown>;
    expect(baseline.version).toBe('1.0.0');
    expect(typeof baseline.config_hash).toBe('string');
    expect(typeof baseline.git_head).toBe('string');
  });

  it('refuses to overwrite existing config without --yes and prints a detected-stack diff', async () => {
    writeFileSync(join(dir, 'slop-audit.config.mjs'), serializeConfig(DEFAULT_CONFIG));

    const { exitCode, stderr } = await run(['init', '--workspace', dir]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('Config file already exists');
    expect(stderr).toContain('Proposed changes:');
    // In an empty temp directory the detected include differs from DEFAULT_CONFIG.
    expect(stderr).toContain('include:');
  });

  it('overwrites a stale baseline with current scan data', async () => {
    writeGitRepo(dir);
    await execFileAsync('git', ['init'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
    await execFileAsync('git', ['add', '.'], { cwd: dir });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: dir });

    const gitHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: dir })).stdout.trim();

    const staleBaseline: BaselineCache = {
      version: '1.0.0',
      config_hash: 'stale-hash',
      git_head: 'stale-head',
      baseline_created: new Date().toISOString(),
      baseline_revision: 99,
      totalComponentCount: 999,
      scores: {
        'src/Stale.tsx': { baselineScore: 999, componentCount: 999 },
      },
    };
    mkdirSync(join(dir, '.slop-audit', 'cache'), { recursive: true });
    writeFileSync(join(dir, '.slop-audit', 'cache', 'baseline.json'), JSON.stringify(staleBaseline, null, 2));

    const { exitCode } = await run(['init', '--yes', '--baseline', '--workspace', dir]);
    expect(exitCode).toBe(0);

    const baselineFile = join(dir, '.slop-audit', 'cache', 'baseline.json');
    const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')) as BaselineCache;
    expect(baseline.config_hash).not.toBe('stale-hash');
    expect(baseline.git_head).toBe(gitHead);
    expect(baseline.scores).not.toHaveProperty('src/Stale.tsx');
    expect(Object.keys(baseline.scores).some((path) => path.endsWith('src/Button.tsx'))).toBe(true);
    expect(baseline.totalComponentCount).not.toBe(999);
  });

  it('ignores filter flags when building a baseline so it represents the full project', async () => {
    writeSloppyProject(dir);
    await execFileAsync('git', ['init'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
    await execFileAsync('git', ['add', '.'], { cwd: dir });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: dir });

    const { exitCode } = await run([
      'init',
      '--yes',
      '--baseline',
      '--ai-only',
      '--ignore-wcag22',
      '--workspace',
      dir,
    ]);
    expect(exitCode).toBe(0);

    const baselineFile = join(dir, '.slop-audit', 'cache', 'baseline.json');
    const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')) as BaselineCache;
    const wcagEntry = Object.entries(baseline.scores).find(([path]) => path.endsWith('WcagSlop.tsx'));
    expect(wcagEntry).toBeDefined();
    expect(wcagEntry![1].baselineScore).toBeGreaterThan(0);
  });
});

describe('git hook commands', () => {
  let dir: string;

  beforeEach(async () => {
    dir = createTmpDir();
    writeGitRepo(dir);
    await execFileAsync('git', ['init'], { cwd: dir });
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('installs and uninstalls the pre-commit hook', async () => {
    const hookPath = join(dir, '.git', 'hooks', 'pre-commit');

    const install = await run(['install', '--workspace', dir]);
    expect(install.exitCode).toBe(0);
    expect(existsSync(hookPath)).toBe(true);
    const installed = readFileSync(hookPath, 'utf8');
    expect(installed).toContain('# slop-audit-hook-begin');
    expect(installed).toContain('npx slop-audit --staged');
    expect(installed).toContain('# slop-audit-hook-end');

    const uninstall = await run(['uninstall', '--workspace', dir]);
    expect(uninstall.exitCode).toBe(0);
    const uninstalled = readFileSync(hookPath, 'utf8');
    expect(uninstalled).not.toContain('# slop-audit-hook-begin');
    expect(uninstalled).not.toContain('# slop-audit-hook-end');
  });

  it('does not duplicate the hook block when install is run twice', async () => {
    const hookPath = join(dir, '.git', 'hooks', 'pre-commit');

    const first = await run(['install', '--workspace', dir]);
    expect(first.exitCode).toBe(0);

    const second = await run(['install', '--workspace', dir]);
    expect(second.exitCode).toBe(0);

    const content = readFileSync(hookPath, 'utf8');
    const beginCount = content.split('\n').filter((line) => line === '# slop-audit-hook-begin').length;
    expect(beginCount).toBe(1);
  });

  it('uninstall is idempotent on an already-uninstalled hook', async () => {
    const hookPath = join(dir, '.git', 'hooks', 'pre-commit');

    await run(['install', '--workspace', dir]);
    const firstUninstall = await run(['uninstall', '--workspace', dir]);
    expect(firstUninstall.exitCode).toBe(0);

    const secondUninstall = await run(['uninstall', '--workspace', dir]);
    expect(secondUninstall.exitCode).toBe(0);

    const content = readFileSync(hookPath, 'utf8');
    expect(content).not.toContain('# slop-audit-hook-begin');
    expect(content).not.toContain('# slop-audit-hook-end');
  });
});

describe('pre-commit gating', () => {
  let dir: string;

  beforeEach(async () => {
    dir = createTmpDir();
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
      join(dir, 'src', 'Button.tsx'),
      'export function Button() { return <button>hi</button>; }',
    );

    const config = {
      ...DEFAULT_CONFIG,
      thresholds: { ...DEFAULT_CONFIG.thresholds, meanSlop: 5, individualSlopThreshold: 50 },
    };
    writeFileSync(join(dir, 'slop-audit.config.mjs'), serializeConfig(config));

    await execFileAsync('git', ['init'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
    await execFileAsync('git', ['add', '.'], { cwd: dir });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: dir });

    const gitHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: dir })).stdout.trim();
    const configHash = hashConfig(config);

    const baseline: BaselineCache = {
      version: '1.0.0',
      config_hash: configHash,
      git_head: gitHead,
      baseline_created: new Date().toISOString(),
      baseline_revision: 1,
      totalComponentCount: 1,
      scores: {
        'src/Existing.tsx': { baselineScore: 4, componentCount: 1 },
      },
    };
    mkdirSync(join(dir, '.slop-audit', 'cache'), { recursive: true });
    writeFileSync(join(dir, '.slop-audit', 'cache', 'baseline.json'), JSON.stringify(baseline, null, 2));
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('rejects the commit when the hypothetical project mean exceeds meanSlop', async () => {
    const install = await run(['install', '--workspace', dir]);
    expect(install.exitCode).toBe(0);

    writeFileSync(
      join(dir, 'src', 'Slop.tsx'),
      `export function Slop() {
  return (
    <div>
      <div className="w-[100px] flex items-center justify-center min-h-screen text-center">one</div>
      <div className="h-[50px] flex items-center justify-center min-h-screen text-center">two</div>
    </div>
  );
}
`,
    );
    await execFileAsync('git', ['add', 'src/Slop.tsx'], { cwd: dir });

    const binDir = join(dir, 'node_modules', '.bin');
    mkdirSync(binDir, { recursive: true });
    symlinkSync(binPath, join(binDir, 'slop-audit'));

    let commitExitCode = 0;
    let commitStderr = '';
    try {
      await execFileAsync('git', ['commit', '-m', 'add slop'], {
        cwd: dir,
        env: { ...process.env, PATH: `${binDir}${delimiter}${process.env.PATH}` },
      });
    } catch (err) {
      const error = err as { stderr?: string | Buffer; code?: number };
      commitExitCode = typeof error.code === 'number' ? error.code : 1;
      commitStderr = error.stderr?.toString() ?? '';
    }

    expect(commitExitCode).not.toBe(0);
    expect(commitStderr).toContain('would raise project mean slop above threshold');
  });
});

describe('pre-commit individual threshold gating', () => {
  let dir: string;

  beforeEach(async () => {
    dir = createTmpDir();
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
      join(dir, 'src', 'Button.tsx'),
      'export function Button() { return <button>hi</button>; }',
    );

    const config = {
      ...DEFAULT_CONFIG,
      thresholds: { ...DEFAULT_CONFIG.thresholds, meanSlop: 100, individualSlopThreshold: 5 },
    };
    writeFileSync(join(dir, 'slop-audit.config.mjs'), serializeConfig(config));

    await execFileAsync('git', ['init'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
    await execFileAsync('git', ['add', '.'], { cwd: dir });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: dir });

    const gitHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: dir })).stdout.trim();
    const configHash = hashConfig(config);

    const baseline: BaselineCache = {
      version: '1.0.0',
      config_hash: configHash,
      git_head: gitHead,
      baseline_created: new Date().toISOString(),
      baseline_revision: 1,
      totalComponentCount: 1,
      scores: {
        'src/Existing.tsx': { baselineScore: 0, componentCount: 1 },
      },
    };
    mkdirSync(join(dir, '.slop-audit', 'cache'), { recursive: true });
    writeFileSync(join(dir, '.slop-audit', 'cache', 'baseline.json'), JSON.stringify(baseline, null, 2));
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('rejects the commit when a staged file exceeds individualSlopThreshold', async () => {
    const install = await run(['install', '--workspace', dir]);
    expect(install.exitCode).toBe(0);

    writeFileSync(
      join(dir, 'src', 'Slop.tsx'),
      `export function Slop() {
  return (
    <div>
      <div className="w-[100px] flex items-center justify-center min-h-screen text-center">one</div>
      <div className="h-[50px] flex items-center justify-center min-h-screen text-center">two</div>
    </div>
  );
}
`,
    );
    await execFileAsync('git', ['add', 'src/Slop.tsx'], { cwd: dir });

    const binDir = join(dir, 'node_modules', '.bin');
    mkdirSync(binDir, { recursive: true });
    symlinkSync(binPath, join(binDir, 'slop-audit'));

    let commitExitCode = 0;
    let commitStderr = '';
    try {
      await execFileAsync('git', ['commit', '-m', 'add slop'], {
        cwd: dir,
        env: { ...process.env, PATH: `${binDir}${delimiter}${process.env.PATH}` },
      });
    } catch (err) {
      const error = err as { stderr?: string | Buffer; code?: number };
      commitExitCode = typeof error.code === 'number' ? error.code : 1;
      commitStderr = error.stderr?.toString() ?? '';
    }

    expect(commitExitCode).not.toBe(0);
    expect(commitStderr).toContain('exceed individual slop threshold');
  });
});

describe('--staged without baseline', () => {
  let dir: string;

  beforeEach(async () => {
    dir = createTmpDir();
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
      join(dir, 'src', 'Button.tsx'),
      'export function Button() { return <button>hi</button>; }',
    );

    writeFileSync(join(dir, 'slop-audit.config.mjs'), serializeConfig(DEFAULT_CONFIG));

    await execFileAsync('git', ['init'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
    await execFileAsync('git', ['add', '.'], { cwd: dir });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: dir });

    writeFileSync(
      join(dir, 'src', 'Slop.tsx'),
      `export function Slop() {
  return (
    <div>
      <div className="w-[100px] flex items-center justify-center min-h-screen text-center">one</div>
    </div>
  );
}
`,
    );
    await execFileAsync('git', ['add', 'src/Slop.tsx'], { cwd: dir });
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('does not crash when checking staged files without a baseline', async () => {
    const { exitCode, stdout, stderr } = await run(['--staged', '--workspace', dir, '--format', 'json']);
    const output = `${stdout}\n${stderr}`;
    expect(output).not.toContain('Unexpected end of JSON input');
    expect(output).not.toContain('Cannot read properties of undefined');
    expect(exitCode).toBe(0);
    const report = JSON.parse(stdout) as ProjectReport;
    expect(report.components.length).toBeGreaterThan(0);
    expect(report.baseline).toBeUndefined();
  });
});

describe('--cache baseline gating', () => {
  let dir: string;

  beforeEach(async () => {
    dir = createTmpDir();
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
      join(dir, 'src', 'Button.tsx'),
      'export function Button() { return <button>hi</button>; }',
    );

    const config = {
      ...DEFAULT_CONFIG,
      thresholds: { ...DEFAULT_CONFIG.thresholds, meanSlop: 5, individualSlopThreshold: 50 },
    };
    writeFileSync(join(dir, 'slop-audit.config.mjs'), serializeConfig(config));

    await execFileAsync('git', ['init'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
    await execFileAsync('git', ['add', '.'], { cwd: dir });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: dir });

    const gitHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: dir })).stdout.trim();
    const configHash = hashConfig(config);

    const baseline: BaselineCache = {
      version: '1.0.0',
      config_hash: configHash,
      git_head: gitHead,
      baseline_created: new Date().toISOString(),
      baseline_revision: 1,
      totalComponentCount: 1,
      scores: {
        'src/Existing.tsx': { baselineScore: 4, componentCount: 1 },
      },
    };
    mkdirSync(join(dir, '.slop-audit', 'cache'), { recursive: true });
    writeFileSync(join(dir, '.slop-audit', 'cache', 'baseline.json'), JSON.stringify(baseline, null, 2));
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('uses the baseline by default', async () => {
    const { exitCode, stdout } = await run(['--workspace', dir, '--format', 'json']);
    const report = JSON.parse(stdout) as ProjectReport;
    expect(exitCode).toBe(0);
    expect(report.baseline).toBeDefined();
    expect(report.baseline?.active).toBe(true);
  });

  it('skips baseline loading with --no-cache', async () => {
    const { exitCode, stdout } = await run(['--workspace', dir, '--format', 'json', '--no-cache']);
    const report = JSON.parse(stdout) as ProjectReport;
    expect(exitCode).toBe(0);
    expect(report.baseline).toBeUndefined();
  });
});

describe('scan-based commands', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
    writeSloppyProject(dir);
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('prints a shields.io badge containing slop--index', async () => {
    const { exitCode, stdout } = await run(['badge', '--workspace', dir]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('slop--index');
    expect(stdout).toContain('https://img.shields.io/badge/slop--index-');
  });

  it('prints remediation advice for sloppy projects', async () => {
    const { exitCode, stdout } = await run(['suggest', '--workspace', dir]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('=== Tier 2: Natural Language Guidance ===');
  });

  it('prints three-tier suggest output with diffs and GIR markers', async () => {
    const { exitCode, stdout } = await run(['suggest', '--workspace', dir]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('=== Tier 1: AST Patch (Unified Diff) ===');
    expect(stdout).toContain('=== Tier 2: Natural Language Guidance ===');
    expect(stdout).toContain('=== Tier 3: GIR Boundary Markers ===');
  });

  it('exits with code 1 and reports issues when thresholds are exceeded', async () => {
    const { exitCode, stdout, stderr } = await run(['--workspace', dir]);
    expect(exitCode).toBe(1);
    const output = `${stdout}\n${stderr}`;
    expect(output).toContain('Slop thresholds exceeded.');
    // Assert on stable category labels and issue presence rather than exact rule IDs.
    expect(output).toContain('Accessibility');
    expect(output).toMatch(/Issues \(\d+\)/);
  });

  it('outputs valid JSON with a slopIndex number using --format json', async () => {
    const { exitCode, stdout } = await run(['--workspace', dir, '--format', 'json']);
    const report = JSON.parse(stdout) as ProjectReport;
    expect(typeof report.slopIndex).toBe('number');
    expect(report.issues.length).toBeGreaterThan(0);
    expect(exitCode).toBe(1);
  });

  it('renders only AI-specific issues with --ai-only', async () => {
    const unfiltered = await run(['--workspace', dir, '--format', 'json']);
    const unfilteredReport = JSON.parse(unfiltered.stdout) as ProjectReport;

    const { exitCode, stdout } = await run(['--workspace', dir, '--format', 'json', '--ai-only']);
    const report = JSON.parse(stdout) as ProjectReport;
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues.every((issue) => issue.aiSpecific)).toBe(true);
    expect(report.issues.some((issue) => issue.category === 'wcag')).toBe(false);
    expect(report.categoryScores.wcag).toBe(0);
    expect(report.slopIndex).toBeLessThan(unfilteredReport.slopIndex);
    expect(exitCode).toBe(0);
  });

  it('renders only human-facing issues with --human-only', async () => {
    const unfiltered = await run(['--workspace', dir, '--format', 'json']);
    const unfilteredReport = JSON.parse(unfiltered.stdout) as ProjectReport;

    const { exitCode, stdout } = await run(['--workspace', dir, '--format', 'json', '--human-only']);
    const report = JSON.parse(stdout) as ProjectReport;
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues.every((issue) => !issue.aiSpecific)).toBe(true);
    expect(report.issues.length).toBeLessThan(unfilteredReport.issues.length);
    expect(exitCode).toBe(1);
  });

  it('removes WCAG 2.2 issues with --ignore-wcag22', async () => {
    const unfiltered = await run(['--workspace', dir, '--format', 'json']);
    const unfilteredReport = JSON.parse(unfiltered.stdout) as ProjectReport;
    expect(unfilteredReport.issues.some((issue) => issue.category === 'wcag')).toBe(true);

    const { exitCode, stdout } = await run(['--workspace', dir, '--format', 'json', '--ignore-wcag22']);
    const report = JSON.parse(stdout) as ProjectReport;
    expect(report.issues.every((issue) => issue.category !== 'wcag')).toBe(true);
    expect(report.categoryScores.wcag).toBe(0);
    expect(report.slopIndex).toBeLessThan(unfilteredReport.slopIndex);
    expect(exitCode).toBe(0);
  });

  it('accepts --cache without breaking the scan', async () => {
    const { exitCode, stdout } = await run(['--workspace', dir, '--format', 'json', '--cache']);
    const report = JSON.parse(stdout) as ProjectReport;
    expect(typeof report.slopIndex).toBe('number');
    expect(exitCode).toBe(1);
  });

  it('outputs migration ROI heatmap with --heatmap', async () => {
    const { exitCode, stdout } = await run(['--workspace', dir, '--heatmap']);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('Migration ROI Heatmap');
    expect(stdout).toContain('ROI');
    expect(stdout).toContain('Score');
    expect(stdout).toContain('AiSlop.tsx');
  });
});

describe('--doctor', () => {
  describe('standalone', () => {
    let dir: string;

    beforeEach(() => {
      dir = createTmpDir();
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(join(dir, 'src', 'Button.tsx'), 'export function Button() { return <div>hi</div>; }');
    });

    afterEach(() => {
      cleanupTempDir(dir);
    });

    it('runs without error and prints a diagnostic summary', async () => {
      await execFileAsync('git', ['init'], { cwd: dir });
      await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
      await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
      await execFileAsync('git', ['add', '.'], { cwd: dir });
      await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: dir });

      const { exitCode, stdout } = await run(['--doctor', '--workspace', dir]);
      expect(exitCode).toBe(0);
      const output = stdout;
      expect(output).toContain('slop-audit diagnostics');
      expect(output).toContain('Node.js');
      expect(output).toContain('@swc/core parser bindings load');
      expect(output).toContain('Git');
      expect(output).toContain('Baseline');
      expect(output).toContain('All diagnostic checks passed');
    });

    it('exits with code 1 when diagnostic checks fail', async () => {
      await execFileAsync('git', ['init'], { cwd: dir });
      await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
      await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
      await execFileAsync('git', ['add', '.'], { cwd: dir });
      await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: dir });

      const staleBaseline: BaselineCache = {
        version: '1.0.0',
        config_hash: 'stale-hash',
        git_head: 'stale-head',
        baseline_created: new Date().toISOString(),
        baseline_revision: 1,
        totalComponentCount: 1,
        scores: {},
      };
      mkdirSync(join(dir, '.slop-audit', 'cache'), { recursive: true });
      writeFileSync(join(dir, '.slop-audit', 'cache', 'baseline.json'), JSON.stringify(staleBaseline, null, 2));

      const { exitCode, stdout } = await run(['--doctor', '--workspace', dir]);
      expect(exitCode).toBe(2);
      expect(stdout).toContain('Baseline stale');
      expect(stdout).toContain('One or more diagnostic checks failed');
    });

    it('skips baseline validation when --no-cache is used', async () => {
      await execFileAsync('git', ['init'], { cwd: dir });
      await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
      await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
      await execFileAsync('git', ['add', '.'], { cwd: dir });
      await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: dir });

      const staleBaseline: BaselineCache = {
        version: '1.0.0',
        config_hash: 'stale-hash',
        git_head: 'stale-head',
        baseline_created: new Date().toISOString(),
        baseline_revision: 1,
        totalComponentCount: 1,
        scores: {},
      };
      mkdirSync(join(dir, '.slop-audit', 'cache'), { recursive: true });
      writeFileSync(join(dir, '.slop-audit', 'cache', 'baseline.json'), JSON.stringify(staleBaseline, null, 2));

      const { exitCode, stdout } = await run(['--doctor', '--no-cache', '--workspace', dir]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Baseline validation skipped (cache disabled)');
      expect(stdout).toContain('All diagnostic checks passed');
    });
  });

  describe('with scan', () => {
    let dir: string;

    beforeEach(async () => {
      dir = createTmpDir();
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(join(dir, 'src', 'Button.tsx'), 'export function Button() { return <div>hi</div>; }');
      await execFileAsync('git', ['init'], { cwd: dir });
      await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
      await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
      await execFileAsync('git', ['add', '.'], { cwd: dir });
      await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: dir });
    });

    afterEach(() => {
      cleanupTempDir(dir);
    });

    it('prints diagnostics before a scan when used with explicit paths', async () => {
      const { exitCode, stdout } = await run(['--doctor', '--workspace', dir, 'src/Button.tsx']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('slop-audit diagnostics');
      expect(stdout).toContain('All diagnostic checks passed');
      expect(stdout).toContain('Slop Index:');
    });
  });
});

describe('--staged without baseline degrade', () => {
  let dir: string;

  beforeEach(async () => {
    dir = createTmpDir();
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
      join(dir, 'src', 'Button.tsx'),
      'export function Button() { return <button>hi</button>; }',
    );

    const config = {
      ...DEFAULT_CONFIG,
      thresholds: { ...DEFAULT_CONFIG.thresholds, meanSlop: 100, individualSlopThreshold: 5 },
    };
    writeFileSync(join(dir, 'slop-audit.config.mjs'), serializeConfig(config));

    await execFileAsync('git', ['init'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
    await execFileAsync('git', ['add', '.'], { cwd: dir });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: dir });
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('degrades to individual threshold gating when no baseline exists', async () => {
    writeFileSync(
      join(dir, 'src', 'Slop.tsx'),
      `export function Slop() {
  return (
    <div>
      <div className="w-[100px] flex items-center justify-center min-h-screen text-center">one</div>
      <div className="h-[50px] flex items-center justify-center min-h-screen text-center">two</div>
    </div>
  );
}
`,
    );
    await execFileAsync('git', ['add', 'src/Slop.tsx'], { cwd: dir });

    const { exitCode, stderr } = await run(['--staged', '--workspace', dir]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('exceed individual slop threshold');
  });
});

describe('--tighten baseline persistence', () => {
  let dir: string;

  beforeEach(async () => {
    dir = createTmpDir();
    writeGitRepo(dir);
    await execFileAsync('git', ['init'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
    await execFileAsync('git', ['add', '.'], { cwd: dir });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: dir });
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('persists tightened baseline scores to disk', async () => {
    const { exitCode: initExit } = await run(['init', '--yes', '--baseline', '--workspace', dir]);
    expect(initExit).toBe(0);

    const baselinePath = join(dir, '.slop-audit', 'cache', 'baseline.json');
    const baselineBefore = JSON.parse(readFileSync(baselinePath, 'utf8')) as BaselineCache;
    expect(baselineBefore.baseline_revision).toBe(0);

    const { exitCode: tightenExit } = await run(['--tighten', '--workspace', dir, '--format', 'json']);
    expect(tightenExit).toBe(0);

    const baselineAfter = JSON.parse(readFileSync(baselinePath, 'utf8')) as BaselineCache;
    expect(baselineAfter.baseline_revision).toBe(1);
    const key = Object.keys(baselineAfter.scores)[0];
    expect(baselineAfter.scores[key].baselineScore).toBeLessThan(
      baselineBefore.scores[key].baselineScore + 0.001,
    );
  });
});

describe('default scan subcommand', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'Button.tsx'), 'export function Button() { return <div>hi</div>; }');
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('accepts an explicit scan subcommand', async () => {
    const { exitCode, stdout } = await run(['scan', '--workspace', dir, '--json']);
    expect(exitCode).toBe(0);
    const report = JSON.parse(stdout) as ProjectReport;
    expect(report.components.length).toBeGreaterThan(0);
  });

  it('works as the default command without the scan keyword', async () => {
    const { exitCode, stdout } = await run(['--workspace', dir, '--json']);
    expect(exitCode).toBe(0);
    const report = JSON.parse(stdout) as ProjectReport;
    expect(report.components.length).toBeGreaterThan(0);
  });
});

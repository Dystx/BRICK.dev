import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { installHook, uninstallHook, type HookResult } from '../src/installer';
import { getGitRoot } from '../src/git';

const createTmpDir = () =>
  mkdtempSync(join(tmpdir(), 'slop-audit-installer-test-'));

const git = (cwd: string, ...args: string[]): void => {
  execFileSync('git', args, { cwd, encoding: 'utf-8' });
};

const hookFile = (repo: string): string =>
  join(repo, '.git', 'hooks', 'pre-commit');

const sentinelBlock = `# slop-audit-hook-begin\nnpx slop-audit --staged\n# slop-audit-hook-end\n`;

describe('installer', () => {
  let repo: string;

  beforeEach(() => {
    repo = createTmpDir();
    git(repo, 'init');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test User');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('installs a fresh pre-commit hook with the sentinel block', () => {
    const root = getGitRoot(repo);
    expect(root).toBeDefined();
    if (root === undefined) throw new Error('Git root not found');
    const result = installHook(root);

    expect(result).toEqual<HookResult>({
      ok: true,
      message: 'Installed pre-commit hook',
      exitCode: 0,
    });
    expect(readFileSync(hookFile(repo), 'utf8')).toBe(sentinelBlock);
    if (process.platform !== 'win32') {
      expect(statSync(hookFile(repo)).mode & 0o777).toBe(0o755);
    }
  });

  it('is idempotent when the hook is already installed', () => {
    const root = getGitRoot(repo);
    expect(root).toBeDefined();
    if (root === undefined) throw new Error('Git root not found');

    installHook(root);
    const second = installHook(root);

    expect(second).toEqual<HookResult>({
      ok: true,
      message: 'Hook already installed',
      exitCode: 0,
    });
    expect(readFileSync(hookFile(repo), 'utf8')).toBe(sentinelBlock);
  });

  it('uninstalls the hook while preserving other content', () => {
    const root = getGitRoot(repo);
    expect(root).toBeDefined();
    if (root === undefined) throw new Error('Git root not found');
    const original = '#!/bin/sh\necho hello';
    writeFileSync(hookFile(repo), original);

    installHook(root);
    const result = uninstallHook(root);

    expect(result).toEqual<HookResult>({
      ok: true,
      message: 'Uninstalled pre-commit hook',
      exitCode: 0,
    });

    if (process.platform !== 'win32') {
      expect(statSync(hookFile(repo)).mode & 0o777).toBe(0o755);
    }

    const content = readFileSync(hookFile(repo), 'utf8');
    expect(content).toContain('#!/bin/sh');
    expect(content).toContain('echo hello');
    expect(content).not.toContain('# slop-audit-hook-begin');
    expect(content).not.toContain('# slop-audit-hook-end');
  });

  it('reports that the hook is not installed when uninstalling an empty repo', () => {
    const root = getGitRoot(repo);
    expect(root).toBeDefined();
    if (root === undefined) throw new Error('Git root not found');
    const result = uninstallHook(root);

    expect(result).toEqual<HookResult>({
      ok: true,
      message: 'Hook not installed',
      exitCode: 0,
    });
    expect(() => statSync(hookFile(repo))).toThrow();
  });

  it('returns an error for a malformed hook with only one sentinel', () => {
    const root = getGitRoot(repo);
    expect(root).toBeDefined();
    if (root === undefined) throw new Error('Git root not found');
    writeFileSync(
      hookFile(repo),
      '#!/bin/sh\n# slop-audit-hook-begin\necho hello\n',
    );

    const result = installHook(root);

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain('Malformed pre-commit hook');
  });
});

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
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

const huskyFile = (repo: string): string => join(repo, '.husky', 'pre-commit');

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
    const result = installHook({ kind: 'git', gitRoot: root });

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

    installHook({ kind: 'git', gitRoot: root });
    const second = installHook({ kind: 'git', gitRoot: root });

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

    installHook({ kind: 'git', gitRoot: root });
    const result = uninstallHook({ kind: 'git', gitRoot: root });

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
    const result = uninstallHook({ kind: 'git', gitRoot: root });

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

    const result = installHook({ kind: 'git', gitRoot: root });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain('Malformed pre-commit hook');
  });

  describe('husky', () => {
    beforeEach(() => {
      mkdirSync(join(repo, '.husky'), { recursive: true });
    });

    it('installs a fresh Husky pre-commit hook with the sentinel block', () => {
      const result = installHook({ kind: 'husky', cwd: repo });

      expect(result).toEqual<HookResult>({
        ok: true,
        message: 'Installed Husky pre-commit hook',
        exitCode: 0,
      });
      expect(readFileSync(huskyFile(repo), 'utf8')).toBe(sentinelBlock);
    });

    it('is idempotent when the Husky hook is already installed', () => {
      installHook({ kind: 'husky', cwd: repo });
      const second = installHook({ kind: 'husky', cwd: repo });

      expect(second).toEqual<HookResult>({
        ok: true,
        message: 'Hook already installed',
        exitCode: 0,
      });
      expect(readFileSync(huskyFile(repo), 'utf8')).toBe(sentinelBlock);
    });

    it('uninstalls the Husky hook while preserving other content', () => {
      const original = 'npm test\n';
      writeFileSync(huskyFile(repo), original);

      installHook({ kind: 'husky', cwd: repo });
      const result = uninstallHook({ kind: 'husky', cwd: repo });

      expect(result).toEqual<HookResult>({
        ok: true,
        message: 'Uninstalled Husky pre-commit hook',
        exitCode: 0,
      });

      const content = readFileSync(huskyFile(repo), 'utf8');
      expect(content).toContain('npm test');
      expect(content).not.toContain('# slop-audit-hook-begin');
      expect(content).not.toContain('# slop-audit-hook-end');
    });

    it('returns an error for a malformed Husky hook with only one sentinel', () => {
      writeFileSync(
        huskyFile(repo),
        'npm test\n# slop-audit-hook-begin\necho hello\n',
      );

      const result = installHook({ kind: 'husky', cwd: repo });

      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain('Malformed Husky pre-commit hook');
    });
  });
});

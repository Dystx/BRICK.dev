import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { collectGitStats, getFilesSince, getGitHead, getGitRoot, getStagedFiles } from '../src/git';

const createTmpDir = () => realpathSync(mkdtempSync(join(tmpdir(), 'slop-audit-git-test-')));

const git = (cwd: string, ...args: string[]): void => {
  execFileSync('git', args, { cwd, encoding: 'utf-8' });
};

describe('git helpers', () => {
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

  describe('getGitRoot', () => {
    it('returns the repo root inside a git repository', () => {
      expect(getGitRoot(repo)).toBe(repo);
    });

    it('returns undefined outside a git repository', () => {
      expect(getGitRoot(tmpdir())).toBeUndefined();
    });

    it('returns the root from a nested directory', () => {
      const nested = join(repo, 'packages', 'app');
      mkdirSync(nested, { recursive: true });
      expect(getGitRoot(nested)).toBe(repo);
    });
  });

  describe('getGitHead', () => {
    it('returns undefined when there are no commits', async () => {
      expect(await getGitHead(repo)).toBeUndefined();
    });

    it('returns the current commit hash', async () => {
      writeFileSync(join(repo, 'file.txt'), 'hello');
      git(repo, 'add', 'file.txt');
      git(repo, 'commit', '-m', 'initial');
      const head = await getGitHead(repo);
      expect(head).toMatch(/^[a-f0-9]{40}$/);
    });

    it('returns undefined outside a git repository', async () => {
      expect(await getGitHead(tmpdir())).toBeUndefined();
    });
  });

  describe('getStagedFiles', () => {
    it('returns an empty array when there are no staged files', async () => {
      expect(await getStagedFiles(repo)).toEqual([]);
    });

    it('returns staged file paths', async () => {
      mkdirSync(join(repo, 'src'), { recursive: true });
      writeFileSync(join(repo, 'src', 'Button.tsx'), 'export const Button = () => {};');
      git(repo, 'add', 'src/Button.tsx');
      expect(await getStagedFiles(repo)).toEqual(['src/Button.tsx']);
    });

    it('returns an empty array outside a git repository', async () => {
      expect(await getStagedFiles(tmpdir())).toEqual([]);
    });
  });

  describe('getFilesSince', () => {
    it('returns files changed since a valid ref', async () => {
      mkdirSync(join(repo, 'src'), { recursive: true });
      writeFileSync(join(repo, 'src', 'Button.tsx'), 'export const Button = () => {};');
      git(repo, 'add', 'src/Button.tsx');
      git(repo, 'commit', '-m', 'initial');

      const head = (await getGitHead(repo)) ?? 'HEAD';

      writeFileSync(join(repo, 'src', 'Card.tsx'), 'export const Card = () => {};');
      git(repo, 'add', 'src/Card.tsx');
      git(repo, 'commit', '-m', 'add card');

      const files = await getFilesSince(repo, head);
      expect(files).toEqual(['src/Card.tsx']);
    });

    it('returns an empty array for an invalid ref', async () => {
      const files = await getFilesSince(repo, 'definitely-not-a-ref');
      expect(files).toEqual([]);
    });

    it('returns an empty array outside a git repository', async () => {
      expect(await getFilesSince(tmpdir(), 'HEAD')).toEqual([]);
    });
  });

  describe('collectGitStats', () => {
    it('returns zero stats for files with no history', async () => {
      mkdirSync(join(repo, 'src'), { recursive: true });
      writeFileSync(join(repo, 'src', 'Button.tsx'), 'export const Button = () => {};');

      const stats = await collectGitStats(repo, [join(repo, 'src', 'Button.tsx')]);

      expect(stats[join(repo, 'src', 'Button.tsx')]).toEqual({
        recent: false,
        editCount: 0,
      });
    });

    it('flags recently committed files and counts edits in the last 30 days', async () => {
      mkdirSync(join(repo, 'src'), { recursive: true });
      const filePath = join(repo, 'src', 'Button.tsx');
      writeFileSync(filePath, 'export const Button = () => {};');
      git(repo, 'add', 'src/Button.tsx');
      git(repo, 'commit', '-m', 'initial');

      const stats = await collectGitStats(repo, [filePath]);

      expect(stats[filePath]).toEqual({
        recent: true,
        editCount: 1,
      });
    });

    it('returns empty stats for files outside a git repository', async () => {
      const filePath = join(tmpdir(), 'orphan.tsx');
      const stats = await collectGitStats(tmpdir(), [filePath]);

      expect(stats[filePath]).toEqual({
        recent: false,
        editCount: 0,
      });
    });
  });
});

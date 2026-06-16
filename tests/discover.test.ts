import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverFiles, findMonorepoRoot } from '../src/discover';
import { DEFAULT_CONFIG } from '../src/config';
import type { ResolvedConfig } from '../src/types';

const createTmpDir = () => realpathSync(mkdtempSync(join(tmpdir(), 'slop-audit-discover-test-')));

const makeConfig = (overrides: Partial<ResolvedConfig> = {}): ResolvedConfig => ({
  ...DEFAULT_CONFIG,
  include: ['src/**/*.{ts,tsx,js,jsx}'],
  exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
  ...overrides,
});

describe('discoverFiles', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds matching source files', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'Button.tsx'), '');
    writeFileSync(join(dir, 'src', 'utils.ts'), '');
    const files = await discoverFiles(dir, makeConfig());
    expect(files).toEqual([
      join(dir, 'src', 'Button.tsx'),
      join(dir, 'src', 'utils.ts'),
    ]);
  });

  it('ignores non-source files', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'styles.css'), '');
    writeFileSync(join(dir, 'src', 'data.json'), '');
    const files = await discoverFiles(dir, makeConfig());
    expect(files).toEqual([]);
  });

  it('excludes files matching exclude patterns', async () => {
    mkdirSync(join(dir, 'src', 'node_modules', 'lib'), { recursive: true });
    mkdirSync(join(dir, 'src', 'dist'), { recursive: true });
    writeFileSync(join(dir, 'src', 'node_modules', 'lib', 'index.ts'), '');
    writeFileSync(join(dir, 'src', 'dist', 'index.js'), '');
    writeFileSync(join(dir, 'src', 'App.tsx'), '');
    const files = await discoverFiles(dir, makeConfig());
    expect(files).toEqual([join(dir, 'src', 'App.tsx')]);
  });

  it('returns absolute paths sorted and de-duplicated', async () => {
    mkdirSync(join(dir, 'src', 'a'), { recursive: true });
    mkdirSync(join(dir, 'src', 'b'), { recursive: true });
    writeFileSync(join(dir, 'src', 'a', 'z.ts'), '');
    writeFileSync(join(dir, 'src', 'b', 'a.ts'), '');
    const files = await discoverFiles(dir, makeConfig({ include: ['src/**/*.ts'] }));
    expect(files).toEqual([
      join(dir, 'src', 'a', 'z.ts'),
      join(dir, 'src', 'b', 'a.ts'),
    ]);
  });

  it('respects custom include patterns', async () => {
    mkdirSync(join(dir, 'lib'), { recursive: true });
    writeFileSync(join(dir, 'lib', 'helper.ts'), '');
    const files = await discoverFiles(dir, makeConfig({ include: ['lib/**/*.ts'] }));
    expect(files).toEqual([join(dir, 'lib', 'helper.ts')]);
  });

  it('does not return files that do not exist', async () => {
    const files = await discoverFiles(dir, makeConfig({ include: ['missing/**/*.ts'] }));
    expect(files).toEqual([]);
  });
});

describe('findMonorepoRoot', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns undefined when no monorepo marker is present', () => {
    expect(findMonorepoRoot(dir)).toBeUndefined();
  });

  it('detects pnpm-workspace.yaml in the current directory', () => {
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    expect(findMonorepoRoot(dir)).toBe(dir);
  });

  it('detects turbo.json in the current directory', () => {
    writeFileSync(join(dir, 'turbo.json'), '{}');
    expect(findMonorepoRoot(dir)).toBe(dir);
  });

  it('walks up to find a monorepo marker', () => {
    const pkgDir = join(dir, 'packages', 'web');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    expect(findMonorepoRoot(pkgDir)).toBe(dir);
  });
});

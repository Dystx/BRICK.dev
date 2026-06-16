import { globby } from 'globby';
import { minimatch } from 'minimatch';
import { existsSync } from 'node:fs';
import { resolve, extname, relative, sep, dirname, join } from 'node:path';
import type { ResolvedConfig } from './types';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.astro']);
const MONOREPO_MARKERS = ['pnpm-workspace.yaml', 'turbo.json'];

export function findMonorepoRoot(cwd: string): string | undefined {
  let current = resolve(cwd);
  while (true) {
    for (const marker of MONOREPO_MARKERS) {
      if (existsSync(join(current, marker))) {
        return current;
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

export async function discoverFiles(cwd: string, config: ResolvedConfig): Promise<string[]> {
  const include = config.include.map((pattern) => resolve(cwd, pattern));
  const raw = await globby(include, { absolute: true, onlyFiles: true });

  const filtered = raw.filter((file) => {
    if (!SOURCE_EXTENSIONS.has(extname(file))) return false;
    const rel = relative(cwd, file).split(sep).join('/');
    if (config.exclude.some((pattern) => minimatch(rel, pattern))) {
      return false;
    }
    return true;
  });

  return Array.from(new Set(filtered)).sort();
}

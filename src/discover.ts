import { globby } from 'globby';
import { minimatch } from 'minimatch';
import { resolve, extname, relative, sep } from 'node:path';
import type { ResolvedConfig } from './types';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.astro']);

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

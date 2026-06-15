import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { VERSION } from '../types';
import type { BaselineCache, ResolvedConfig } from '../types';

const BASELINE_VERSION = VERSION;

function sanitizeForHash(value: unknown): unknown {
  if (value instanceof RegExp) {
    return { __type: 'RegExp', source: value.source, flags: value.flags };
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForHash);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeForHash(v)]),
    );
  }
  return value;
}

export function hashConfig(config: ResolvedConfig): string {
  return createHash('sha256')
    .update(JSON.stringify(sanitizeForHash(config)))
    .digest('hex');
}

export function baselinePath(projectPath: string): string {
  return join(projectPath, '.slop-audit', 'cache', 'baseline.json');
}

function isBaselineCache(value: unknown): value is BaselineCache {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (obj.version !== BASELINE_VERSION) return false;
  if (typeof obj.config_hash !== 'string') return false;
  if (typeof obj.git_head !== 'string') return false;
  if (typeof obj.baseline_created !== 'string') return false;
  if (typeof obj.baseline_revision !== 'number') return false;
  if (typeof obj.totalComponentCount !== 'number') return false;
  if (!obj.scores || typeof obj.scores !== 'object') return false;
  for (const entry of Object.values(obj.scores)) {
    if (!entry || typeof entry !== 'object') return false;
    const score = entry as Record<string, unknown>;
    if (typeof score.baselineScore !== 'number') return false;
    if (typeof score.componentCount !== 'number') return false;
  }
  return true;
}

export function loadBaseline(projectPath: string): BaselineCache | undefined {
  const path = baselinePath(projectPath);
  if (!existsSync(path)) return undefined;
  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(content);
    if (!isBaselineCache(parsed)) {
      console.error(`Invalid baseline cache at ${path}; ignoring.`);
      return undefined;
    }
    return parsed;
  } catch (err) {
    console.error(`Failed to load baseline cache at ${path}:`, err);
    return undefined;
  }
}

export function saveBaseline(projectPath: string, cache: BaselineCache): void {
  const path = baselinePath(projectPath);
  mkdirSync(join(projectPath, '.slop-audit', 'cache'), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2));
}

export function tightenBaseline(cache: BaselineCache): BaselineCache {
  const next = { ...cache };
  next.baseline_revision = cache.baseline_revision + 1;
  next.scores = {};
  for (const [file, score] of Object.entries(cache.scores)) {
    next.scores[file] = {
      ...score,
      baselineScore: Math.round(score.baselineScore * 0.9 * 100) / 100,
    };
  }
  return next;
}

export function validateBaseline(
  cache: BaselineCache,
  configHash: string,
  gitHead: string,
): { valid: boolean; reason?: string } {
  if (cache.version !== BASELINE_VERSION) return { valid: false, reason: 'baseline version mismatch' };
  if (cache.config_hash !== configHash) return { valid: false, reason: 'config_hash mismatch' };
  if (cache.git_head !== gitHead) return { valid: false, reason: 'git_head mismatch' };
  return { valid: true };
}

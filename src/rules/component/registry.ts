import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import bundledSnapshot from './shadcn-snapshot';

export interface RegistryComponentSchema {
  allowedProps?: string[];
  disallowedProps?: string[];
}

export interface RegistrySnapshot {
  version: string;
  bundledVersion: string;
  components: Record<string, RegistryComponentSchema>;
}

const DEFAULT_REGISTRY_SNAPSHOT_URL = 'https://unpkg.com/slop-audit@latest/rules/shadcn-snapshot.json';
const DEFAULT_REFRESH_TIMEOUT_MS = 3000;

function isRegistrySnapshot(value: unknown): value is RegistrySnapshot {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.version !== 'string') return false;
  if (typeof obj.bundledVersion !== 'string') return false;
  if (!obj.components || typeof obj.components !== 'object') return false;
  return true;
}

async function fetchRemoteSnapshot(
  url: string,
  timeoutMs: number,
): Promise<RegistrySnapshot | undefined> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const parsed = await response.json();
  if (!isRegistrySnapshot(parsed)) {
    throw new Error('Remote registry snapshot is malformed.');
  }
  return parsed;
}

function loadLocalSnapshot(path: string): RegistrySnapshot | undefined {
  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(content);
    if (isRegistrySnapshot(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore malformed or missing local snapshot.
  }
  return undefined;
}

function localSnapshotPath(projectPath: string): string {
  return join(projectPath, '.slop-audit', 'cache', 'registry-snapshot.json');
}

export function loadRegistrySnapshot(projectPath: string): RegistrySnapshot {
  const localPath = localSnapshotPath(projectPath);
  if (existsSync(localPath)) {
    const local = loadLocalSnapshot(localPath);
    if (local) return local;
  }
  return bundledSnapshot;
}

export function isStaleSnapshot(local: RegistrySnapshot, bundled: RegistrySnapshot): boolean {
  return local.bundledVersion !== bundled.bundledVersion;
}

export function checkRegistrySnapshotFreshness(projectPath: string): { fresh: boolean; reason?: string } {
  const localPath = localSnapshotPath(projectPath);
  if (!existsSync(localPath)) {
    return { fresh: false, reason: 'Local registry snapshot missing; using bundled snapshot.' };
  }
  const local = loadRegistrySnapshot(projectPath);
  if (isStaleSnapshot(local, bundledSnapshot)) {
    return {
      fresh: false,
      reason: `Local registry snapshot (${local.bundledVersion}) is older than bundled (${bundledSnapshot.bundledVersion}).`,
    };
  }
  return { fresh: true };
}

export interface RefreshResult {
  success: boolean;
  source?: 'network' | 'bundled';
  error?: string;
}

export async function refreshRegistrySnapshot(
  projectPath: string,
  options?: {
    url?: string;
    timeoutMs?: number;
  },
): Promise<RefreshResult> {
  const url = options?.url ?? DEFAULT_REGISTRY_SNAPSHOT_URL;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_REFRESH_TIMEOUT_MS;
  const localPath = localSnapshotPath(projectPath);

  try {
    const remote = await fetchRemoteSnapshot(url, timeoutMs);
    if (remote) {
      mkdirSync(dirname(localPath), { recursive: true });
      writeFileSync(localPath, JSON.stringify(remote, null, 2));
      return { success: true, source: 'network' };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Network failures are non-fatal; fall through to bundled snapshot.
    return { success: false, source: 'bundled', error: message };
  }

  return { success: false, source: 'bundled' };
}

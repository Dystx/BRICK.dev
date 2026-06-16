import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

function isRegistrySnapshot(value: unknown): value is RegistrySnapshot {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.version !== 'string') return false;
  if (typeof obj.bundledVersion !== 'string') return false;
  if (!obj.components || typeof obj.components !== 'object') return false;
  return true;
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

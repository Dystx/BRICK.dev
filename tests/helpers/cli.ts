import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

export const execFileAsync = promisify(execFile);
export const repoRoot = resolve(__dirname, '../..');
export const binPath = join(repoRoot, 'bin', 'slop-audit.js');
export const workerScript = join(repoRoot, 'dist', 'engine', 'worker.js');

export const createTmpDir = () => mkdtempSync(join(tmpdir(), 'slop-audit-test-'));

export function cleanupTempDir(dir: string): void {
  if (!dir) return;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures so they do not mask real test failures
  }
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function run(args: string[], cwd = repoRoot): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [binPath, ...args], { cwd });
    return { stdout: stdout ?? '', stderr: stderr ?? '', exitCode: 0 };
  } catch (err) {
    const error = err as { stdout?: string | Buffer; stderr?: string | Buffer; code?: number };
    return {
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? '',
      exitCode: typeof error.code === 'number' ? error.code : 1,
    };
  }
}

export function assertDistBuilt(): void {
  if (!existsSync(workerScript)) {
    throw new Error(
      `dist/ is not built. Run "pnpm build" before running tests. (missing ${workerScript})`,
    );
  }
}

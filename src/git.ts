import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function isExpectedGitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EACCES') return true;
  // execFile reports non-zero exits on `code`; execFileSync reports them on `status`.
  const status = (error as { status?: string | number }).status;
  const exitCode = status ?? code;
  if (exitCode === 128 || exitCode === '128' || exitCode === 129 || exitCode === '129') return true;
  return false;
}

async function runGit(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf-8',
    });
    return stdout.trim();
  } catch (error) {
    if (isExpectedGitError(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function getGitHead(cwd: string): Promise<string | undefined> {
  return runGit(cwd, ['rev-parse', 'HEAD']);
}

export async function getStagedFiles(cwd: string): Promise<string[]> {
  const output = await runGit(cwd, ['diff', '--cached', '--name-only']);
  if (!output) return [];
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

export async function getFilesSince(cwd: string, ref: string): Promise<string[]> {
  const output = await runGit(cwd, ['diff', '--name-only', `${ref}..HEAD`]);
  if (!output) return [];
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

export function getGitRoot(cwd: string): string | undefined {
  try {
    const stdout = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf-8',
    });
    return stdout.trim();
  } catch (error) {
    if (isExpectedGitError(error)) {
      return undefined;
    }
    throw error;
  }
}

export interface GitFileStats {
  recent: boolean;
  editCount: number;
}

export async function collectGitStats(
  cwd: string,
  filePaths: string[],
): Promise<Record<string, GitFileStats>> {
  const stats: Record<string, GitFileStats> = {};
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  for (const filePath of filePaths) {
    const lastCommitOutput = await runGit(cwd, ['log', '-1', '--format=%ct', '--', filePath]);
    let recent = false;
    if (lastCommitOutput) {
      const lastCommitMs = parseInt(lastCommitOutput, 10) * 1000;
      recent = now - lastCommitMs <= thirtyDaysMs;
    }

    const recentCommitsOutput = await runGit(cwd, [
      'log',
      '--since=30 days ago',
      '--format=%h',
      '--',
      filePath,
    ]);
    const editCount = recentCommitsOutput
      ? recentCommitsOutput.split('\n').filter(Boolean).length
      : 0;

    stats[filePath] = { recent, editCount };
  }

  return stats;
}

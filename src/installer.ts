import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const BEGIN_SENTINEL = '# slop-audit-hook-begin';
const END_SENTINEL = '# slop-audit-hook-end';
const SENTINEL_BLOCK = `${BEGIN_SENTINEL}\nnpx slop-audit --staged\n${END_SENTINEL}\n`;

export type HookResult = {
  ok: boolean;
  message: string;
  exitCode: 0 | 2;
};

export type HookTarget =
  | { kind: 'git'; gitRoot: string }
  | { kind: 'husky'; cwd: string };

export function hasHuskyDirectory(cwd: string): boolean {
  const huskyPath = join(cwd, '.husky');
  return existsSync(huskyPath) && lstatSync(huskyPath).isDirectory();
}

function resolveHookPath(target: HookTarget): string {
  if (target.kind === 'husky') {
    return join(target.cwd, '.husky', 'pre-commit');
  }
  return join(target.gitRoot, '.git', 'hooks', 'pre-commit');
}

function ensureParentDir(target: HookTarget, path: string): void {
  if (target.kind === 'husky') {
    mkdirSync(join(target.cwd, '.husky'), { recursive: true });
  } else {
    mkdirSync(join(target.gitRoot, '.git', 'hooks'), { recursive: true });
  }
}

function setExecutable(path: string, target: HookTarget): void {
  if (target.kind === 'git') {
    chmodSync(path, 0o755);
  }
}

function readHookContent(path: string): string {
  return readFileSync(path, 'utf8');
}

function sentinelsPresent(content: string): { begin: boolean; end: boolean } {
  const lines = content.split(/\r?\n/);
  return {
    begin: lines.some((line) => line === BEGIN_SENTINEL),
    end: lines.some((line) => line === END_SENTINEL),
  };
}

export function installHook(target: HookTarget): HookResult {
  const path = resolveHookPath(target);
  const hookType = target.kind === 'husky' ? 'Husky pre-commit' : 'pre-commit';

  if (existsSync(path)) {
    const content = readHookContent(path);
    const { begin, end } = sentinelsPresent(content);

    if (begin && end) {
      return {
        ok: true,
        message: `Hook already installed`,
        exitCode: 0,
      };
    }

    if (begin || end) {
      const found = begin ? BEGIN_SENTINEL : END_SENTINEL;
      const missing = begin ? END_SENTINEL : BEGIN_SENTINEL;
      return {
        ok: false,
        message: `Malformed ${hookType} hook: found ${found} without matching ${missing}`,
        exitCode: 2,
      };
    }

    const normalized =
      content.length > 0 && !content.endsWith('\n') ? `${content}\n` : content;

    writeFileSync(path, `${normalized}${SENTINEL_BLOCK}`);
    setExecutable(path, target);
    return {
      ok: true,
      message: `Installed ${hookType} hook`,
      exitCode: 0,
    };
  }

  ensureParentDir(target, path);
  writeFileSync(path, SENTINEL_BLOCK);
  setExecutable(path, target);

  return {
    ok: true,
    message: `Installed ${hookType} hook`,
    exitCode: 0,
  };
}

export function uninstallHook(target: HookTarget): HookResult {
  const path = resolveHookPath(target);
  const hookType = target.kind === 'husky' ? 'Husky pre-commit' : 'pre-commit';

  if (!existsSync(path)) {
    return {
      ok: true,
      message: 'Hook not installed',
      exitCode: 0,
    };
  }

  const content = readHookContent(path);
  const { begin: hasBegin, end: hasEnd } = sentinelsPresent(content);

  if (!hasBegin && !hasEnd) {
    return {
      ok: true,
      message: 'Hook not installed',
      exitCode: 0,
    };
  }

  const lines = content.split(/\r?\n/);
  const beginIndex = lines.indexOf(BEGIN_SENTINEL);
  const endIndex = lines.indexOf(END_SENTINEL);

  if (beginIndex === -1 || endIndex === -1 || beginIndex > endIndex) {
    return {
      ok: false,
      message: `Malformed ${hookType} hook: sentinel block is incomplete`,
      exitCode: 2,
    };
  }

  let start = beginIndex;
  while (start > 0 && lines[start - 1] === '') {
    start -= 1;
  }

  let end = endIndex;
  while (end < lines.length - 1 && lines[end + 1] === '') {
    end += 1;
  }

  const remaining = [...lines.slice(0, start), ...lines.slice(end + 1)];
  const result = remaining.join('\n');

  writeFileSync(path, result.endsWith('\n') ? result : `${result}\n`);

  return {
    ok: true,
    message: `Uninstalled ${hookType} hook`,
    exitCode: 0,
  };
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { VERSION } from '../types.js';
import type { Issue } from '../types.js';

const ANCHOR = `/* @slop-audit:v${VERSION}:fix:focus-ring */`;
const CSS_BLOCK = `${ANCHOR}\n:focus-visible {\n  outline: 2px solid currentColor;\n  outline-offset: 2px;\n}\n`;

export function computeFocusRingPatch(
  original: string,
  _issue: Issue,
): { original: string; modified: string } | null {
  if (original.includes(ANCHOR)) {
    return null;
  }

  const newContent =
    original.length > 0 && !original.endsWith('\n')
      ? `${original}\n\n${CSS_BLOCK}`
      : `${original}${CSS_BLOCK}`;
  return { original, modified: newContent };
}

export function applyFocusRingFix(issue: Issue): {
  applied: boolean;
  reason?: string;
} {
  if (!issue.fix || issue.fix.kind !== 'css-anchor') {
    return { applied: false, reason: 'No CSS-anchor fix suggestion available' };
  }

  const targetFile = issue.fix.targetFile;
  if (!targetFile) {
    return { applied: false, reason: 'No globalCssTarget configured' };
  }

  const original = existsSync(targetFile) ? readFileSync(targetFile, 'utf-8') : '';
  const patch = computeFocusRingPatch(original, issue);
  if (!patch) {
    return { applied: false, reason: 'Focus-ring CSS block already present' };
  }

  mkdirSync(dirname(targetFile), { recursive: true });
  try {
    writeFileSync(targetFile, patch.modified);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { applied: false, reason: `Could not write CSS: ${message}` };
  }
  return { applied: true };
}

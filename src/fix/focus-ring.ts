import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Issue } from '../types.js';

const ANCHOR = '/* @slop-audit:v1.0.0:fix:focus-ring */';
const CSS_BLOCK = `${ANCHOR}\n:focus-visible {\n  outline: 2px solid currentColor;\n  outline-offset: 2px;\n}\n`;

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

  const existing = existsSync(targetFile) ? readFileSync(targetFile, 'utf-8') : '';
  if (existing.includes(ANCHOR)) {
    return { applied: false, reason: 'Focus-ring CSS block already present' };
  }

  const newContent = existing.length > 0 && !existing.endsWith('\n')
    ? `${existing}\n\n${CSS_BLOCK}`
    : `${existing}${CSS_BLOCK}`;
  mkdirSync(dirname(targetFile), { recursive: true });
  try {
    writeFileSync(targetFile, newContent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { applied: false, reason: `Could not write CSS: ${message}` };
  }
  return { applied: true };
}

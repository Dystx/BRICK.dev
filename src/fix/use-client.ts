import type { Issue } from '../types.js';

const DIRECTIVE = '"use client";';

export function applyUseClientFix(source: string, issue: Issue): {
  source: string;
  applied: boolean;
  reason?: string;
} {
  if (source.trimStart().startsWith(DIRECTIVE)) {
    return { source, applied: false, reason: "'use client' directive already present" };
  }

  const trimmed = source.trimStart();
  const leadingWhitespace = source.slice(0, source.length - trimmed.length);
  const newSource = `${leadingWhitespace}${DIRECTIVE}\n${trimmed}`;
  return { source: newSource, applied: true };
}

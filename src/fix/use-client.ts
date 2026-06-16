import { VERSION } from '../types.js';
import type { Issue } from '../types.js';

const DIRECTIVE_RE = /^["']use client["'];?/;
const ANCHOR = `@slop-audit:v${VERSION}:fix:use-client`;

export function applyUseClientFix(source: string, _issue: Issue): {
  source: string;
  applied: boolean;
  reason?: string;
} {
  if (source.includes(ANCHOR)) {
    return { source, applied: false, reason: "'use client' fix anchor already present" };
  }

  if (DIRECTIVE_RE.test(source.trimStart())) {
    return { source, applied: false, reason: "'use client' directive already present" };
  }

  const trimmed = source.trimStart();
  const leadingWhitespace = source.slice(0, source.length - trimmed.length);
  const newSource = `${leadingWhitespace}"use client"; // ${ANCHOR}\n${trimmed}`;
  return { source: newSource, applied: true };
}

import type { Issue } from '../types.js';
import { nearestSpacingToken } from '../rules/utils.js';

export { nearestSpacingToken };

function replaceClass(source: string, offender: string, replacement: string): string {
  const attrRe = /\b(className|class)\s*=\s*("[^"]*"|'[^']*'|`[^`]*`)/g;
  const escaped = offender.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const classRe = new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'g');
  let modified = false;

  const result = source.replace(attrRe, (match, attrName: string, value: string) => {
    const quote = value[0];
    const inner = value.slice(1, -1);
    const newInner = inner.replace(classRe, (_: string, before: string, after: string) => {
      modified = true;
      return `${before}${replacement}${after}`;
    });
    if (newInner === inner) return match;
    return `${attrName}=${quote}${newInner}${quote}`;
  });

  return modified ? result : source;
}

export function applyLayoutTokenFix(source: string, issue: Issue): {
  source: string;
  applied: boolean;
  reason?: string;
} {
  if (!issue.fix || issue.fix.kind !== 'replace') {
    return { source, applied: false, reason: 'No replace fix suggestion available' };
  }

  const offenders = (issue.fix.anchor ?? '').split(/\s+/).filter((c) => c.length > 0);
  const replacements = (issue.fix.replacement ?? '').split(/\s+/).filter((c) => c.length > 0);
  if (offenders.length === 0 || replacements.length !== offenders.length) {
    return { source, applied: false, reason: 'Malformed layout-token fix suggestion' };
  }

  let modified = source;
  let anyApplied = false;
  for (let i = 0; i < offenders.length; i++) {
    const offender = offenders[i];
    const replacement = replacements[i];
    if (offender === replacement) continue;
    const previous = modified;
    modified = replaceClass(modified, offender, replacement);
    if (modified !== previous) {
      anyApplied = true;
    }
  }

  if (!anyApplied) {
    return { source, applied: false, reason: 'No replaceable layout tokens found' };
  }

  return { source: modified, applied: true };
}

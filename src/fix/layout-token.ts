import type { Issue } from '../types.js';
import { DEFAULT_SPACING_SCALE } from '../config.js';

const LAYOUT_ARBITRARY_RE = /^(w|h|p|px|py|mx|my|gap|min-w|min-h|max-w|max-h|inset)-\[(.*)\]$/;

export function nearestSpacingToken(className: string, scale: readonly number[]): string | undefined {
  const match = LAYOUT_ARBITRARY_RE.exec(className);
  if (!match) return undefined;
  const prefix = match[1];
  const rawValue = match[2].trim();

  let px: number | undefined;
  if (rawValue.endsWith('px')) {
    px = parseFloat(rawValue.slice(0, -2));
  } else if (rawValue.endsWith('rem')) {
    px = parseFloat(rawValue.slice(0, -3)) * 16;
  }
  if (px === undefined || Number.isNaN(px)) return undefined;

  let nearest: number | undefined;
  let nearestDiff = Infinity;
  for (const token of scale) {
    const tokenPx = token * 4;
    const diff = Math.abs(tokenPx - px);
    if (diff < nearestDiff) {
      nearestDiff = diff;
      nearest = token;
    }
  }

  if (nearest === undefined || nearestDiff > 1) return undefined;
  return `${prefix}-${nearest}`;
}

function replaceClass(source: string, offender: string, replacement: string): string {
  const escaped = offender.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[\\s"'\`])${escaped}([\\s"'\`]|$)`, 'g');
  return source.replace(re, (_match, before: string, after: string) => `${before}${replacement}${after}`);
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

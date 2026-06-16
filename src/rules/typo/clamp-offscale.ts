import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

const DEFAULT_TYPOGRAPHY_SCALE_PX = [12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72];

const CLAMP_RE = /clamp\(([^,]+),\s*([^,]+),\s*([^)]+)\)/gi;
const NUMERIC_VALUE_RE = /([\d.]+)(px|rem)/gi;
const TAILWIND_TEXT_CLAMP_RE = /text-\[(clamp\([^)]+\))\]/gi;
const FONTSIZE_PROP_RE = /['"]?(?:fontSize|font-size)['"]?\s*:/i;

interface ClampOffender {
  segment: string;
  value: number;
  nearest: number;
  deviation: number;
}

function toPx(value: string): number | undefined {
  const match = /^([\d.]+)(px|rem)$/i.exec(value.trim());
  if (!match) return undefined;
  const num = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (Number.isNaN(num)) return undefined;
  return unit === 'px' ? num : num * 16;
}

function nearestScaleDeviation(px: number): { nearest: number; deviation: number } {
  let nearest = DEFAULT_TYPOGRAPHY_SCALE_PX[0];
  let minDiff = Math.abs(px - nearest);
  for (const step of DEFAULT_TYPOGRAPHY_SCALE_PX) {
    const diff = Math.abs(px - step);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = step;
    }
  }
  return { nearest, deviation: minDiff / nearest };
}

function checkClampSegments(source: string): ClampOffender[] {
  const offenders: ClampOffender[] = [];
  const clampMatches = source.matchAll(CLAMP_RE);
  for (const clampMatch of clampMatches) {
    const segments = [clampMatch[1], clampMatch[2], clampMatch[3]];
    for (const segment of segments) {
      const numericMatches = segment.matchAll(NUMERIC_VALUE_RE);
      for (const match of numericMatches) {
        const px = toPx(`${match[1]}${match[2]}`);
        if (px === undefined) continue;
        const { nearest, deviation } = nearestScaleDeviation(px);
        if (deviation > 0.2) {
          offenders.push({ segment: segment.trim(), value: px, nearest, deviation });
        }
      }
    }
  }
  return offenders;
}

function formatOffenders(offenders: ClampOffender[]): string {
  return offenders
    .map(
      (o) =>
        `${o.segment} (${o.value}px deviates ${Math.round(o.deviation * 100)}% from ${o.nearest}px)`,
    )
    .join(', ');
}

export const clampOffscaleRule = createRule<unknown>({
  id: 'typo/clamp-offscale',
  category: 'typo',
  severity: 'medium',
  aiSpecific: false,
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];

    for (const styleProp of facts.styleProps) {
      if (!FONTSIZE_PROP_RE.test(styleProp.source)) continue;
      const offenders = checkClampSegments(styleProp.source);
      if (offenders.length > 0) {
        issues.push({
          ruleId: 'typo/clamp-offscale',
          category: 'typo',
          severity: 'medium',
          aiSpecific: false,
          message: `Responsive font-size clamp() value deviates from the type scale: ${formatOffenders(offenders)}`,
          line: styleProp.line,
          column: styleProp.column,
          advice: 'Align clamp() min/preferred/max sizes with the design typography scale.',
        });
      }
    }

    for (const classNameFact of facts.staticClassNames) {
      const clampMatches = classNameFact.value.matchAll(TAILWIND_TEXT_CLAMP_RE);
      for (const match of clampMatches) {
        const offenders = checkClampSegments(match[1]);
        if (offenders.length > 0) {
          issues.push({
            ruleId: 'typo/clamp-offscale',
            category: 'typo',
            severity: 'medium',
            aiSpecific: false,
            message: `Responsive font-size class deviates from the type scale: ${formatOffenders(offenders)}`,
            line: classNameFact.line,
            column: classNameFact.column,
            advice: 'Align clamp() min/preferred/max sizes with the design typography scale.',
          });
        }
      }
    }

    return issues;
  },
});

export default clampOffscaleRule satisfies Rule<unknown>;

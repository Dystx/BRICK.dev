import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

const TAILWIND_TEXT_SIZES: Record<string, number> = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
  '6xl': 60,
  '7xl': 72,
  '8xl': 96,
  '9xl': 128,
};

const TEXT_CLASS_RE = /^text-(.+)$/;
const ARBITRARY_TEXT_SIZE_RE = /^text-\[(.+)\]$/;

function parseTextSize(classNames: string[], styleSource?: string): number | undefined {
  for (const className of classNames) {
    const match = TEXT_CLASS_RE.exec(className);
    if (!match) continue;
    const token = match[1];
    if (TAILWIND_TEXT_SIZES[token] !== undefined) {
      return TAILWIND_TEXT_SIZES[token];
    }
    const arb = ARBITRARY_TEXT_SIZE_RE.exec(className);
    if (arb) {
      const raw = arb[1].trim();
      if (raw.endsWith('px')) {
        const px = parseFloat(raw.slice(0, -2));
        if (Number.isFinite(px)) return px;
      } else if (raw.endsWith('rem')) {
        const rem = parseFloat(raw.slice(0, -3));
        if (Number.isFinite(rem)) return rem * 16;
      }
    }
  }
  if (styleSource) {
    const m = /fontSize:\s*['"]?([^;'"}]+)/i.exec(styleSource);
    if (m) {
      const raw = m[1].trim();
      if (raw.endsWith('px')) {
        const px = parseFloat(raw.slice(0, -2));
        if (Number.isFinite(px)) return px;
      } else if (raw.endsWith('rem')) {
        const rem = parseFloat(raw.slice(0, -3));
        if (Number.isFinite(rem)) return rem * 16;
      }
    }
  }
  return undefined;
}

interface SizedHeading {
  level: number;
  size: number;
  line: number;
  column: number;
}

function headingHierarchyIssues(headings: SizedHeading[]): Issue[] {
  if (headings.length < 2) return [];
  const issues: Issue[] = [];
  for (let i = 0; i < headings.length; i++) {
    for (let j = i + 1; j < headings.length; j++) {
      const a = headings[i];
      const b = headings[j];
      if (a.level === b.level || a.size === b.size) continue;
      const levelOrder = a.level < b.level;
      const sizeOrder = a.size > b.size;
      if (levelOrder !== sizeOrder) {
        issues.push({
          ruleId: 'typo/heading-hierarchy',
          category: 'typo',
          severity: 'high',
          aiSpecific: false,
          message: `Heading hierarchy inversion: h${a.level} (${a.size}px) appears before h${b.level} (${b.size}px)`,
          line: a.line,
          column: a.column,
          advice: 'Make semantic heading order match visual size order (larger size = lower level).',
        });
      }
    }
  }
  return issues;
}

export const headingHierarchyRule = createRule<unknown>({
  id: 'typo/heading-hierarchy',
  category: 'typo',
  severity: 'high',
  aiSpecific: false,
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    for (const component of facts.components) {
      const sized = component.headings
        .map((h) => ({
          level: h.level,
          size: parseTextSize(h.classNames.map((c) => c.value), h.styleSource),
          line: h.line,
          column: h.column,
        }))
        .filter((h): h is SizedHeading => h.size !== undefined);
      issues.push(...headingHierarchyIssues(sized));
    }
    return issues;
  },
});

export default headingHierarchyRule satisfies Rule<unknown>;

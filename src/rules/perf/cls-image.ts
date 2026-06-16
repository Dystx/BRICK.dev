import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

export const clsImageRule = createRule<unknown>({
  id: 'perf/cls-image',
  category: 'perf',
  severity: 'low',
  aiSpecific: false,
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    for (const element of facts.jsxElements) {
      if (element.tag !== 'img') continue;
      if (element.attributes.loading !== 'lazy') continue;

      const hasWidth = element.attributes.width !== undefined;
      const hasHeight = element.attributes.height !== undefined;
      if (hasWidth && hasHeight) continue;

      const classString = element.classNames.map((c) => c.value).join(' ');
      const hasAspect = /\baspect-\b/.test(classString);
      if (!hasWidth && !hasHeight && !hasAspect) {
        issues.push({
          ruleId: 'perf/cls-image',
          category: 'perf',
          severity: 'low',
          aiSpecific: false,
          message: 'Lazy-loaded <img> is missing explicit width/height or aspect-ratio',
          line: element.line,
          column: element.column,
          advice:
            'Add width and height attributes or an aspect- utility class to reserve space and avoid CLS.',
        });
      }
    }
    return issues;
  },
});

export default clsImageRule satisfies Rule<unknown>;

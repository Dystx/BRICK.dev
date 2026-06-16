import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { isArbitraryEasing, splitClassName } from '../utils';

export const arbitraryEasingRule = createRule<unknown>({
  id: 'motion/arbitrary-easing',
  category: 'motion',
  severity: 'low',
  aiSpecific: false,
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    for (const classNameFact of facts.staticClassNames) {
      const classes = splitClassName(classNameFact.value);
      const offenders = classes.filter((className) => isArbitraryEasing(className));
      if (offenders.length > 0) {
        issues.push({
          ruleId: 'motion/arbitrary-easing',
          category: 'motion',
          severity: 'low',
          aiSpecific: false,
          message: `Arbitrary easing ${offenders.map((o) => `'${o}'`).join(', ')}`,
          line: classNameFact.line,
          column: classNameFact.column,
          advice: 'Use an easing token (e.g., ease-in-out, ease-out).',
        });
      }
    }
    return issues;
  },
});

export default arbitraryEasingRule satisfies Rule<unknown>;

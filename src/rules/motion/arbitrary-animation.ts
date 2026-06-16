import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { isArbitraryAnimation, splitClassName } from '../utils';

export const arbitraryAnimationRule = createRule<unknown>({
  id: 'motion/arbitrary-animation',
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
      const offenders = classes.filter((className) => isArbitraryAnimation(className));
      if (offenders.length > 0) {
        issues.push({
          ruleId: 'motion/arbitrary-animation',
          category: 'motion',
          severity: 'low',
          aiSpecific: false,
          message: `Arbitrary animation ${offenders.map((o) => `'${o}'`).join(', ')}`,
          line: classNameFact.line,
          column: classNameFact.column,
          advice: 'Use an animation token (e.g., animate-spin, animate-ping).',
        });
      }
    }
    return issues;
  },
});

export default arbitraryAnimationRule satisfies Rule<unknown>;

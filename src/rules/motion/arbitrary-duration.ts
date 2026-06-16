import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { isArbitraryDuration, splitClassName } from '../utils';

export const arbitraryDurationRule = createRule<unknown>({
  id: 'motion/arbitrary-duration',
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
      const offenders = classes.filter((className) => isArbitraryDuration(className));
      if (offenders.length > 0) {
        issues.push({
          ruleId: 'motion/arbitrary-duration',
          category: 'motion',
          severity: 'low',
          aiSpecific: false,
          message: `Arbitrary duration ${offenders.map((o) => `'${o}'`).join(', ')}`,
          line: classNameFact.line,
          column: classNameFact.column,
          advice: 'Use a duration token (e.g., duration-200, duration-300).',
        });
      }
    }
    return issues;
  },
});

export default arbitraryDurationRule satisfies Rule<unknown>;

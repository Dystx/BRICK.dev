import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { isArbitraryTransition, splitClassName } from '../utils';

export const arbitraryTransitionRule = createRule<unknown>({
  id: 'motion/arbitrary-transition',
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
      const offenders = classes.filter((className) => isArbitraryTransition(className));
      if (offenders.length > 0) {
        issues.push({
          ruleId: 'motion/arbitrary-transition',
          category: 'motion',
          severity: 'low',
          aiSpecific: false,
          message: `Arbitrary transition ${offenders.map((o) => `'${o}'`).join(', ')}`,
          line: classNameFact.line,
          column: classNameFact.column,
          advice: 'Use a transition token (e.g., transition-colors, transition-opacity).',
        });
      }
    }
    return issues;
  },
});

export default arbitraryTransitionRule satisfies Rule<unknown>;

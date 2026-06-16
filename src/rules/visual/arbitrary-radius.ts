import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { isArbitraryBorderRadius, splitClassName } from '../utils';

export const arbitraryRadiusRule = createRule<unknown>({
  id: 'visual/arbitrary-radius',
  category: 'visual',
  severity: 'low',
  aiSpecific: false,
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    for (const classNameFact of facts.staticClassNames) {
      const classes = splitClassName(classNameFact.value);
      const offenders = classes.filter((className) => isArbitraryBorderRadius(className));
      if (offenders.length > 0) {
        issues.push({
          ruleId: 'visual/arbitrary-radius',
          category: 'visual',
          severity: 'low',
          aiSpecific: false,
          message: `Arbitrary border radius ${offenders.map((o) => `'${o}'`).join(', ')}`,
          line: classNameFact.line,
          column: classNameFact.column,
          advice: 'Use a border-radius token (e.g., rounded-sm, rounded-md, rounded-full).',
        });
      }
    }
    return issues;
  },
});

export default arbitraryRadiusRule satisfies Rule<unknown>;

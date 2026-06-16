import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { isArbitraryZIndex, splitClassName } from '../utils';

export const arbitraryZIndexRule = createRule<unknown>({
  id: 'visual/arbitrary-z-index',
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
      const offenders = classes.filter((className) => isArbitraryZIndex(className));
      if (offenders.length > 0) {
        issues.push({
          ruleId: 'visual/arbitrary-z-index',
          category: 'visual',
          severity: 'low',
          aiSpecific: false,
          message: `Arbitrary z-index ${offenders.map((o) => `'${o}'`).join(', ')}`,
          line: classNameFact.line,
          column: classNameFact.column,
          advice: 'Use a z-index token (e.g., z-0, z-10, z-50).',
        });
      }
    }
    return issues;
  },
});

export default arbitraryZIndexRule satisfies Rule<unknown>;

import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

export const inlineStyleRule = createRule<unknown>({
  id: 'visual/inline-style',
  category: 'visual',
  severity: 'high',
  aiSpecific: true,
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    for (const styleProp of facts.styleProps) {
      issues.push({
        ruleId: 'visual/inline-style',
        category: 'visual',
        severity: 'high',
        aiSpecific: true,
        message: 'Inline style prop detected',
        line: styleProp.line,
        column: styleProp.column,
        advice: 'Move the style to a class or design-system token.',
      });
    }
    return issues;
  },
});

export default inlineStyleRule satisfies Rule<unknown>;

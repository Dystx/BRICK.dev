import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface GhostDefensiveContext {
  maxDepth: number;
}

export const ghostDefensiveRule = createRule<GhostDefensiveContext>({
  id: 'logic/ghost-defensive',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  create(_context: RuleContext): GhostDefensiveContext {
    return { maxDepth: 3 };
  },
  analyze(context: GhostDefensiveContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];

    for (const expression of facts.logicalExpressions) {
      if (expression.depth >= context.maxDepth) {
        issues.push({
          ruleId: 'logic/ghost-defensive',
          category: 'logic',
          severity: 'medium',
          aiSpecific: true,
          message: `Ghost defensive chain: ${expression.text}`,
          line: expression.line,
          column: expression.column,
          advice: 'Use optional chaining (?.) or early returns instead of deep && guards.',
        });
      }
    }

    return issues;
  },
});

export default ghostDefensiveRule satisfies Rule<GhostDefensiveContext>;

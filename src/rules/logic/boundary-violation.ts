import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

const CLIENT_HOOKS = new Set(['useState', 'useEffect', 'useContext']);

export interface BoundaryViolationContext {
  clientHooks: ReadonlySet<string>;
}

export const boundaryViolationRule = createRule<BoundaryViolationContext>({
  id: 'logic/boundary-violation',
  category: 'logic',
  severity: 'high',
  aiSpecific: true,
  create(_context: RuleContext): BoundaryViolationContext {
    return { clientHooks: CLIENT_HOOKS };
  },
  analyze(context: BoundaryViolationContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];

    for (const component of facts.components) {
      if (!component.isServerComponent) continue;

      for (const hook of component.hookCalls) {
        if (context.clientHooks.has(hook.name)) {
          issues.push({
            ruleId: 'logic/boundary-violation',
            category: 'logic',
            severity: 'high',
            aiSpecific: true,
            message: `Client hook '${hook.name}' called inside a server component`,
            line: component.line,
            column: component.column,
            advice: "Add the 'use client' directive or move the hook to a client component.",
          });
        }
      }
    }

    return issues;
  },
});

export default boundaryViolationRule satisfies Rule<BoundaryViolationContext>;

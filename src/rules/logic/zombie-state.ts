import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface ZombieStateContext {
  // No configuration needed.
}

export const zombieStateRule = createRule<ZombieStateContext>({
  id: 'logic/zombie-state',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  create(_context: RuleContext): ZombieStateContext {
    return {};
  },
  analyze(_context: ZombieStateContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];

    for (const component of facts.components) {
      for (const binding of component.stateBindings) {
        if (
          binding.valueName !== undefined &&
          binding.setterName !== undefined &&
          !binding.valueReferenced &&
          !binding.setterReferenced
        ) {
          issues.push({
            ruleId: 'logic/zombie-state',
            category: 'logic',
            severity: 'medium',
            aiSpecific: true,
            message: `Zombie state '${binding.valueName}' / '${binding.setterName}' is never used`,
            line: binding.line,
            column: binding.column,
            advice: 'Remove the unused useState or wire it into the component.',
          });
        }
      }
    }

    return issues;
  },
});

export default zombieStateRule satisfies Rule<ZombieStateContext>;

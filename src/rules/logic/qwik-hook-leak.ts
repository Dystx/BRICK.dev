import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface QwikHookLeakContext {
  framework?: string;
}

const REACT_HOOKS = new Set(['useState', 'useEffect', 'useContext']);

export const qwikHookLeakRule = createRule<QwikHookLeakContext>({
  id: 'logic/qwik-hook-leak',
  category: 'logic',
  severity: 'high',
  aiSpecific: true,
  create(context: RuleContext): QwikHookLeakContext {
    return { framework: context.config.framework };
  },
  analyze(context: QwikHookLeakContext, facts: ScanFacts): Issue[] {
    if (context.framework !== 'qwik') {
      return [];
    }

    const issues: Issue[] = [];

    for (const component of facts.components) {
      for (const hook of component.hookCalls) {
        if (REACT_HOOKS.has(hook.name)) {
          issues.push({
            ruleId: 'logic/qwik-hook-leak',
            category: 'logic',
            severity: 'high',
            aiSpecific: true,
            message: `React hook '${hook.name}' leaked into Qwik component layout`,
            line: hook.line,
            column: hook.column,
            advice:
              "Qwik uses $-prefixed signals and hooks from @builder.io/qwik; replace React-style hooks with Qwik primitives such as useSignal$ or useTask$.",
          });
        }
      }
    }

    return issues;
  },
});

export default qwikHookLeakRule satisfies Rule<QwikHookLeakContext>;

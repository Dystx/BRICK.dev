import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

const NATIVE_INTERACTIVE = new Set(['button', 'a', 'input']);

export interface PrimitiveReinventionContext {
  registry: Record<string, string[]> | undefined;
  registeredNames: Set<string>;
  hasButtonPrimitive: boolean;
}

export const primitiveReinventionRule = createRule<PrimitiveReinventionContext>({
  id: 'component/primitive-reinvention',
  category: 'component',
  severity: 'high',
  aiSpecific: true,
  create(context: RuleContext): PrimitiveReinventionContext {
    const registry = context.config.componentRegistry;
    const registeredNames = new Set<string>();
    if (registry) {
      for (const names of Object.values(registry)) {
        for (const name of names) {
          registeredNames.add(name);
        }
      }
    }
    return {
      registry,
      registeredNames,
      hasButtonPrimitive: Boolean(registry && Array.isArray(registry.button) && registry.button.length > 0),
    };
  },
  analyze(context: PrimitiveReinventionContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!context.registry) return issues;

    for (const element of facts.interactiveElements) {
      if (NATIVE_INTERACTIVE.has(element.tag)) continue;
      if (context.registeredNames.has(element.tag)) continue;

      if (context.hasButtonPrimitive && (element.tag === 'div' || element.tag === 'span')) {
        issues.push({
          ruleId: 'component/primitive-reinvention',
          category: 'component',
          severity: 'high',
          aiSpecific: true,
          message: `<${element.tag}> with onClick reinvents the registered Button primitive`,
          line: element.line,
          column: element.column,
          advice: 'Use the project Button component instead of rebuilding it from a div/span.',
        });
      }
    }

    return issues;
  },
});

export default primitiveReinventionRule satisfies Rule<PrimitiveReinventionContext>;

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { loadRegistrySnapshot, type RegistrySnapshot } from './registry';

export interface ShadcnPropMismatchContext {
  snapshot: RegistrySnapshot;
}

export const shadcnPropMismatchRule = createRule<ShadcnPropMismatchContext>({
  id: 'component/shadcn-prop-mismatch',
  category: 'component',
  severity: 'high',
  aiSpecific: true,
  create(context: RuleContext): ShadcnPropMismatchContext {
    return {
      snapshot: loadRegistrySnapshot(process.cwd()),
    };
  },
  analyze(context: ShadcnPropMismatchContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    for (const element of facts.jsxElements) {
      const schema = context.snapshot.components[element.tag];
      if (!schema) continue;
      if (schema.disallowedProps?.includes('className') && ('className' in element.attributes || element.classNames.length > 0)) {
        issues.push({
          ruleId: 'component/shadcn-prop-mismatch',
          category: 'component',
          severity: 'high',
          aiSpecific: true,
          message: `Component '${element.tag}' does not accept a className prop in the shadcn/ui registry.`,
          line: element.line,
          column: element.column,
          advice: 'Use the component\'s built-in variants or compose wrapper elements instead of overriding className.',
        });
      }
    }
    return issues;
  },
});

export default shadcnPropMismatchRule satisfies Rule<ShadcnPropMismatchContext>;

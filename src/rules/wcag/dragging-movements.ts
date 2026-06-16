import type { Rule, Issue, ScanFacts } from '../../types';
import { createRule } from '../rule';

export const draggingMovementsRule = createRule<unknown>({
  id: 'wcag/dragging-movements',
  category: 'wcag',
  severity: 'medium',
  aiSpecific: false,
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];

    for (const element of facts.jsxElements) {
      if (element.attributes.draggable !== 'true') {
        continue;
      }

      const hasAlternative =
        'onClick' in element.attributes ||
        'onPointerDown' in element.attributes ||
        'onKeyDown' in element.attributes ||
        element.attributes.role === 'button';

      if (!hasAlternative) {
        issues.push({
          ruleId: 'wcag/dragging-movements',
          category: 'wcag',
          severity: 'medium',
          aiSpecific: false,
          message: `Draggable '${element.tag}' lacks a pointer or tap alternative`,
          line: element.line,
          column: element.column,
          advice:
            'Add an onClick, onPointerDown, onKeyDown handler or role="button" so the element can be operated without dragging.',
        });
      }
    }

    return issues;
  },
});

export default draggingMovementsRule satisfies Rule<unknown>;

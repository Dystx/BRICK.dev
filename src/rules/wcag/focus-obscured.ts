import type { Rule, Issue, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { splitClassName } from '../utils';

const POSITION_OBSCURE_RE = /^(.+:)*(fixed|sticky)$/;

function isObscuringPosition(className: string): boolean {
  return POSITION_OBSCURE_RE.test(className);
}

export const focusObscuredRule = createRule<unknown>({
  id: 'wcag/focus-obscured',
  category: 'wcag',
  severity: 'low',
  aiSpecific: false,
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    for (const classFact of facts.staticClassNames) {
      const classes = splitClassName(classFact.value);
      if (classes.some((className) => isObscuringPosition(className))) {
        return [
          {
            ruleId: 'wcag/focus-obscured',
            category: 'wcag',
            severity: 'low',
            aiSpecific: false,
            message:
              'Fixed or sticky positioning may obscure focused elements; verify focus-not-obscured behavior.',
            line: classFact.line,
            column: classFact.column,
            advice:
              'Ensure fixed or sticky containers do not cover elements receiving keyboard focus.',
          },
        ];
      }
    }

    return [];
  },
});

export default focusObscuredRule satisfies Rule<unknown>;

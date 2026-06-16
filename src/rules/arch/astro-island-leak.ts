import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface AstroIslandLeakContext {
  isAstro: boolean;
}

function isComponentTag(tag: string): boolean {
  return tag.length > 0 && tag[0] === tag[0].toUpperCase();
}

function hasClientDirective(attributes: Record<string, string | undefined>): boolean {
  return Object.keys(attributes).some((name) => name.startsWith('client:'));
}

export const astroIslandLeakRule = createRule<AstroIslandLeakContext>({
  id: 'arch/astro-island-leak',
  category: 'arch',
  severity: 'low',
  aiSpecific: true,
  create(context: RuleContext): AstroIslandLeakContext {
    return {
      isAstro:
        context.config.framework === 'astro' || context.filePath.endsWith('.astro'),
    };
  },
  analyze(context: AstroIslandLeakContext, facts: ScanFacts): Issue[] {
    if (!context.isAstro) return [];

    const issues: Issue[] = [];
    for (const element of facts.jsxElements) {
      const hasOnClick = Object.prototype.hasOwnProperty.call(element.attributes, 'onClick');
      const isComponent = isComponentTag(element.tag);
      const hasClient = hasClientDirective(element.attributes);

      if (hasOnClick) {
        issues.push({
          ruleId: 'arch/astro-island-leak',
          category: 'arch',
          severity: 'low',
          aiSpecific: true,
          message: `<${element.tag}> registers an inline onClick handler`,
          line: element.line,
          column: element.column,
          advice:
            'Move the handler into a hydrated island component (client:load, client:visible, etc.) or use a <script> for progressive enhancement.',
        });
      } else if (isComponent && !hasClient) {
        issues.push({
          ruleId: 'arch/astro-island-leak',
          category: 'arch',
          severity: 'low',
          aiSpecific: true,
          message: `<${element.tag}> is used without a client:* hydration directive`,
          line: element.line,
          column: element.column,
          advice: `Add a hydration directive such as client:load or client:visible to <${element.tag}> so it can run interactively on the client.`,
        });
      }
    }

    return issues;
  },
});

export default astroIslandLeakRule satisfies Rule<AstroIslandLeakContext>;

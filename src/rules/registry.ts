import { builtinRules } from './builtins';
import type { Rule, RuleContext, ResolvedConfig, Severity } from '../types';

export interface EnabledRule {
  rule: Rule;
  context: unknown;
}

function isSeverity(value: unknown): value is Severity {
  return value === 'low' || value === 'medium' || value === 'high';
}

function withEffectiveSeverity(rule: Rule, severity: Severity): Rule {
  return {
    ...rule,
    severity,
    analyze: (context, facts) =>
      rule.analyze(context, facts).map((issue) => ({ ...issue, severity })),
  };
}

export class RuleRegistry {
  private rules = new Map<string, Rule>();

  register(rule: Rule): void {
    this.rules.set(rule.id, rule);
  }

  loadBuiltins(): void {
    for (const rule of builtinRules) {
      this.register(rule);
    }
  }

  getRules(filter?: { kind: 'ai' | 'human' }): Rule[] {
    const list = Array.from(this.rules.values());
    if (!filter) return list;
    return list.filter((r) => (filter.kind === 'ai' ? r.aiSpecific : !r.aiSpecific));
  }

  resolveEnabledRules(config: ResolvedConfig): Rule[] {
    return this.getRules()
      .map((rule) => {
        const configured = config.rules[rule.id];
        if (configured === 'off') {
          return null;
        }
        const effectiveSeverity = isSeverity(configured) ? configured : rule.severity;
        return withEffectiveSeverity(rule, effectiveSeverity);
      })
      .filter((rule): rule is Rule => rule !== null);
  }

  createContexts(config: ResolvedConfig, filePath: string): EnabledRule[] {
    const context: RuleContext = { config, filePath };
    return this.resolveEnabledRules(config).map((rule) => ({
      rule,
      context: rule.create(context),
    }));
  }
}

import { describe, expect, it } from 'vitest';
import { builtinRules } from '../../src/rules/builtins';
import { RuleRegistry } from '../../src/rules/registry';
import { createRule } from '../../src/rules/rule';
import type { Issue, ResolvedConfig, Rule, ScanFacts, Severity } from '../../src/types';

function makeConfig(): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    contextTaxCaps: { cleanCap: 0, standardCap: 0 },
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: {
      meanSlop: 0,
      p90Slop: 0,
      individualSlopThreshold: 0,
    },
  };
}

function makeFacts(): ScanFacts {
  return {
    filePath: 'Button.tsx',
    astNodeCount: 0,
    components: [],
    staticClassNames: [],
    interactiveElements: [],
    hooks: [],
    logicalExpressions: [],
  };
}

function makeIssue(ruleId: string, severity: Severity): Issue {
  return {
    ruleId,
    category: 'logic',
    severity,
    aiSpecific: true,
    message: 'issue',
    line: 1,
    column: 1,
  };
}

describe('RuleRegistry', () => {
  it('registers and retrieves rules', () => {
    const registry = new RuleRegistry();
    const rule = createRule({
      id: 'test/rule',
      category: 'logic',
      severity: 'medium',
      aiSpecific: true,
      create: () => ({}),
      analyze: (): Issue[] => [],
    });
    registry.register(rule);
    expect(registry.getRules()).toHaveLength(1);
  });

  it('filters by ai and human kind', () => {
    const registry = new RuleRegistry();
    registry.register(
      createRule({ id: 'a', category: 'logic', severity: 'low', aiSpecific: true, create: () => ({}), analyze: () => [] })
    );
    registry.register(
      createRule({ id: 'b', category: 'logic', severity: 'low', aiSpecific: false, create: () => ({}), analyze: () => [] })
    );
    expect(registry.getRules({ kind: 'ai' })).toHaveLength(1);
    expect(registry.getRules({ kind: 'human' })).toHaveLength(1);
  });

  it('creates rule contexts', () => {
    const registry = new RuleRegistry();
    const rule = createRule({
      id: 'test/rule',
      category: 'logic',
      severity: 'medium',
      aiSpecific: true,
      create: (ctx) => ({ filePath: ctx.filePath }),
      analyze: (): Issue[] => [],
    });
    registry.register(rule);
    const enabled = registry.createContexts(makeConfig(), 'Button.tsx');
    expect(enabled).toHaveLength(1);
    expect(enabled[0].context).toEqual({ filePath: 'Button.tsx' });
  });

  it('loads all built-in rules', () => {
    const registry = new RuleRegistry();
    registry.loadBuiltins();
    const rules = registry.getRules();
    const expectedIds = builtinRules.map((r) => r.id).sort();
    expect(rules.map((r) => r.id).sort()).toEqual(expectedIds);
  });

  it('excludes disabled rules from resolveEnabledRules', () => {
    const registry = new RuleRegistry();
    registry.register(
      createRule({
        id: 'test/disabled',
        category: 'logic',
        severity: 'medium',
        aiSpecific: true,
        create: () => ({}),
        analyze: () => [makeIssue('test/disabled', 'medium')],
      }),
    );
    const config = makeConfig();
    config.rules['test/disabled'] = 'off';

    const enabled = registry.resolveEnabledRules(config);

    expect(enabled).toHaveLength(0);
  });

  it('applies severity override in resolveEnabledRules', () => {
    const registry = new RuleRegistry();
    registry.register(
      createRule({
        id: 'test/severity',
        category: 'logic',
        severity: 'low',
        aiSpecific: true,
        create: () => ({}),
        analyze: () => [makeIssue('test/severity', 'low')],
      }),
    );
    const config = makeConfig();
    config.rules['test/severity'] = 'high';

    const enabled = registry.resolveEnabledRules(config);

    expect(enabled).toHaveLength(1);
    expect(enabled[0].severity).toBe('high');
    const issues = enabled[0].analyze({}, makeFacts());
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('high');
  });
});

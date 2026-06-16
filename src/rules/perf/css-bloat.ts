import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import type { RuleRegistry } from '../registry';
import { createRule } from '../rule';

export interface CssBloatContext {
  seenFiles: Map<string, Set<string>>;
  reported: Set<string>;
}

const ACCUMULATOR_KEY = Symbol.for('slop-audit:css-bloat-accumulator');

function getAccumulator(registry: RuleRegistry | undefined): CssBloatContext {
  if (registry) {
    const existing = (registry as unknown as Record<symbol, CssBloatContext>)[ACCUMULATOR_KEY];
    if (existing) return existing;
    const created: CssBloatContext = { seenFiles: new Map(), reported: new Set() };
    (registry as unknown as Record<symbol, CssBloatContext>)[ACCUMULATOR_KEY] = created;
    return created;
  }
  // Fallback for direct rule usage without a registry (e.g. unit tests).
  return { seenFiles: new Map(), reported: new Set() };
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export const cssBloatRule = createRule<CssBloatContext>({
  id: 'perf/css-bloat',
  category: 'perf',
  severity: 'low',
  aiSpecific: false,
  create(context: RuleContext): CssBloatContext {
    return getAccumulator(context.registry);
  },
  beforeRescan(context: CssBloatContext, filePath: string): void {
    for (const [normalized, files] of context.seenFiles) {
      if (files.has(filePath)) {
        files.delete(filePath);
        if (files.size <= 5) {
          context.reported.delete(normalized);
        }
        if (files.size === 0) {
          context.seenFiles.delete(normalized);
        }
      }
    }
  },
  analyze(context: CssBloatContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    for (const classFact of facts.staticClassNames) {
      const normalized = normalize(classFact.value);
      if (normalized.length === 0) continue;

      const files = context.seenFiles.get(normalized);
      if (files) {
        files.add(facts.filePath);
      } else {
        context.seenFiles.set(normalized, new Set([facts.filePath]));
      }

      const distinctFileCount = context.seenFiles.get(normalized)!.size;
      if (distinctFileCount > 5 && !context.reported.has(normalized)) {
        context.reported.add(normalized);
        const preview = normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized;
        issues.push({
          ruleId: 'perf/css-bloat',
          category: 'perf',
          severity: 'low',
          aiSpecific: false,
          message: `Identical className string repeated in ${distinctFileCount} distinct files: "${preview}"`,
          line: classFact.line,
          column: classFact.column,
          advice:
            'Extract the repeated utility string into a shared constant or component to reduce CSS bloat.',
        });
      }
    }
    return issues;
  },
});

export default cssBloatRule satisfies Rule<CssBloatContext>;

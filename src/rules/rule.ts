import type { ScanFacts, Issue, RuleContext, Rule } from '../types';

export interface RuleFactory<Context = unknown> {
  id: string;
  category: Rule['category'];
  severity: Rule['severity'];
  aiSpecific: boolean;
  create(context: RuleContext): Context;
  analyze(context: Context, facts: ScanFacts): Issue[];
  beforeRescan?(context: Context, filePath: string): void;
}

export function createRule<Context>(def: RuleFactory<Context>): Rule<Context> {
  return def as Rule<Context>;
}

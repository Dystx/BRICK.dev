export const VERSION = '1.0.0';

export type Severity = 'low' | 'medium' | 'high';

export type Category =
  | 'visual'
  | 'typo'
  | 'motion'
  | 'wcag'
  | 'layout'
  | 'component'
  | 'logic'
  | 'arch'
  | 'perf';

export interface FixSuggestion {
  kind: 'insert' | 'replace' | 'css-anchor';
  description: string;
  targetFile?: string;
  anchor?: string;
  replacement?: string;
}

export interface FixApplication {
  ruleId: string;
  description: string;
  line: number;
  column: number;
  reason?: string;
}

export interface FixResult {
  filePath: string;
  applied: FixApplication[];
  skipped: FixApplication[];
}

export interface Issue {
  ruleId: string;
  category: Category;
  severity: Severity;
  aiSpecific: boolean;
  filePath?: string;
  message: string;
  line: number;
  column: number;
  advice?: string;
  fix?: FixSuggestion;
}

export interface ClassNameFact {
  value: string;
  line: number;
  column: number;
}

export interface ElementFact {
  tag: string;
  attributes: Record<string, string | undefined>;
  classNames: ClassNameFact[];
  line: number;
  column: number;
}

export interface HookFact {
  name: string;
  line: number;
  column: number;
}

export interface StateBinding {
  valueName?: string;
  setterName?: string;
  line: number;
  column: number;
  valueReferenced: boolean;
  setterReferenced: boolean;
}

export interface ComponentFacts {
  name?: string;
  line: number;
  column: number;
  isServerComponent: boolean;
  hookCalls: HookFact[];
  stateBindings: StateBinding[];
  headings: HeadingFact[];
}

export interface LogicalExpressionFact {
  depth: number;
  line: number;
  column: number;
  text: string;
}

export interface StylePropFact {
  source: string;
  line: number;
  column: number;
}

export interface HeadingFact {
  level: number;
  classNames: ClassNameFact[];
  styleSource?: string;
  line: number;
  column: number;
}

export interface ForcedLayoutGroup {
  line: number;
  column: number;
  count: number;
}

export interface ScanFacts {
  filePath: string;
  astNodeCount: number;
  components: ComponentFacts[];
  staticClassNames: ClassNameFact[];
  styleProps: StylePropFact[];
  jsxElements: ElementFact[];
  interactiveElements: ElementFact[];
  hooks: HookFact[];
  logicalExpressions: LogicalExpressionFact[];
  forcedLayoutGroups: ForcedLayoutGroup[];
}

export interface FileScanResult {
  filePath: string;
  componentCount: number;
  astNodeCount: number;
  issues: Issue[];
  parseError?: string;
}

export interface ComponentScore {
  filePath: string;
  rawScore: number;
  componentScore: number;
  adjustedScore: number;
  componentCount: number;
}

export interface BaselineMeta {
  active: boolean;
  version: string;
  baselineRevision: number;
  createdAt: string;
}

export interface ProjectReport {
  version: string;
  generatedAt: string;
  configPath?: string;
  slopIndex: number;
  assemblyHealth: number;
  categoryScores: Record<Category, number>;
  p90Score: number;
  peakScore: number;
  componentCount: number;
  components: ComponentScore[];
  issues: Issue[];
  baseline?: BaselineMeta;
}

export interface BaselineCache {
  version: string;
  config_hash: string;
  git_head: string;
  baseline_created: string;
  baseline_revision: number;
  totalComponentCount: number;
  scores: Record<string, { baselineScore: number; componentCount: number }>;
}

export interface SlopAuditRun {
  timestamp: string;
  version: string;
  slopIndex: number;
  categoryScores: Record<Category, number>;
  topOffenseIds: string[];
  thresholdExceeded: boolean;
}

export interface RuleContext {
  config: ResolvedConfig;
  filePath: string;
  /**
   * The registry that created this context. Rules can use it to store
   * cross-file state that persists for the lifetime of a worker or scan.
   */
  registry?: import('./rules/registry').RuleRegistry;
}

export interface Rule<Context = unknown> {
  id: string;
  category: Category;
  severity: Severity;
  aiSpecific: boolean;
  create(context: RuleContext): Context;
  analyze(context: Context, facts: ScanFacts): Issue[];
  /**
   * Optional hook called before a file is rescanned in watch mode.
   * Rules with cross-file state should clear any stale contributions
   * from the given file path. The rule context is the same instance that
   * will be used for the upcoming analyze pass.
   */
  beforeRescan?(context: Context, filePath: string): void;
}

export interface ResolvedConfig {
  framework?: string;
  include: string[];
  exclude: string[];
  rules: Record<string, Severity | 'off'>;
  frameworkMultipliers: Record<string, number>;
  ruleConfig: Record<string, unknown>;
  contextTaxCaps: { cleanCap: number; standardCap: number };
  globalCssTarget?: string;
  thresholds: {
    meanSlop: number;
    p90Slop: number;
    individualSlopThreshold: number;
  };
  arbitraryValueAllowlist: (string | RegExp)[];
  gapTokens?: string[];
  wcag: {
    targetSizeExemptSelectors: (string | RegExp)[];
  };
  // Calibration wizard fields
  styling?: string;
  uiLibrary?: string;
  baseSpacing?: number;
  typeScaleRatio?: number;
  arbitraryTolerance?: 'strict' | 'balanced' | 'permissive';
  strictness?: 'brutal' | 'balanced' | 'gentle';
  legacyPaths?: string[];
  allowedArbitraryPaths?: string[];
  componentRegistry?: Record<string, string[]>;
  disabledRules?: string[];
  bannedDefaults?: boolean;
  projectMemory?: boolean;
  categoryThresholds?: Record<string, number>;
}

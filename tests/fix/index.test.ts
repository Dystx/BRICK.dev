import { describe, expect, it, beforeAll, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyFixes, applyLayoutTokenFix, applyUseClientFix } from '../../src/fix/index';
import { applyFocusRingFix } from '../../src/fix/focus-ring';
import { nearestSpacingToken } from '../../src/fix/layout-token';
import { serializeConfig, DEFAULT_CONFIG } from '../../src/index';
import type { Issue, ResolvedConfig } from '../../src/types';
import {
  assertDistBuilt,
  cleanupTempDir,
  createTmpDir,
  run,
} from '../helpers/cli';

function makeIssue(overrides: Partial<Issue> & Pick<Issue, 'ruleId' | 'line' | 'column'>): Issue {
  return {
    category: 'logic',
    severity: 'high',
    aiSpecific: true,
    message: 'test issue',
    filePath: 'test.tsx',
    advice: 'fix it',
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
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
    ...overrides,
  };
}

describe('applyUseClientFix', () => {
  it('inserts "use client" at the top of a file', () => {
    const source = `export function Page() {
  const [x, setX] = useState(0);
  return <div />;
}
`;
    const result = applyUseClientFix(source, makeIssue({ ruleId: 'logic/boundary-violation', line: 1, column: 1 }));
    expect(result.applied).toBe(true);
    expect(result.source.startsWith('"use client";\n')).toBe(true);
    expect(result.source).toContain('export function Page()');
  });

  it('is idempotent when the directive already exists', () => {
    const source = `"use client";
export function Page() { return <div />; }
`;
    const result = applyUseClientFix(source, makeIssue({ ruleId: 'logic/boundary-violation', line: 2, column: 1 }));
    expect(result.applied).toBe(false);
    expect(result.reason).toContain('already present');
  });
});

describe('nearestSpacingToken', () => {
  it('maps exact px values to tokens', () => {
    expect(nearestSpacingToken('p-[16px]', [0, 1, 2, 4, 8])).toBe('p-4');
    expect(nearestSpacingToken('w-[32px]', [0, 1, 2, 4, 8])).toBe('w-8');
  });

  it('maps near-px values within 1px tolerance', () => {
    expect(nearestSpacingToken('p-[13px]', [0, 1, 2, 3, 3.5, 4])).toBe('p-3');
  });

  it('skips values outside tolerance', () => {
    expect(nearestSpacingToken('w-[100px]', [0, 1, 2, 4, 8])).toBeUndefined();
  });

  it('skips non-layout arbitrary values', () => {
    expect(nearestSpacingToken('bg-[red]', [0, 1, 2, 4, 8])).toBeUndefined();
  });
});

describe('applyLayoutTokenFix', () => {
  it('replaces a layout arbitrary value with a token', () => {
    const source = '<div className="p-[13px]" />';
    const issue = makeIssue({
      ruleId: 'visual/arbitrary-escape',
      line: 1,
      column: 1,
      fix: {
        kind: 'replace',
        description: 'Replace layout arbitrary value(s) with design-system tokens',
        anchor: 'p-[13px]',
        replacement: 'p-3',
      },
    });
    const result = applyLayoutTokenFix(source, issue);
    expect(result.applied).toBe(true);
    expect(result.source).toBe('<div className="p-3" />');
  });

  it('replaces multiple offenders in a single fix', () => {
    const source = '<div className="p-[13px] m-[16px]" />';
    const issue = makeIssue({
      ruleId: 'visual/arbitrary-escape',
      line: 1,
      column: 1,
      fix: {
        kind: 'replace',
        description: 'Replace layout arbitrary value(s) with design-system tokens',
        anchor: 'p-[13px] m-[16px]',
        replacement: 'p-3 m-4',
      },
    });
    const result = applyLayoutTokenFix(source, issue);
    expect(result.applied).toBe(true);
    expect(result.source).toBe('<div className="p-3 m-4" />');
  });

  it('skips when no replace fix is provided', () => {
    const source = '<div className="p-[13px]" />';
    const result = applyLayoutTokenFix(source, makeIssue({ ruleId: 'visual/arbitrary-escape', line: 1, column: 1 }));
    expect(result.applied).toBe(false);
  });
});

describe('applyFocusRingFix', () => {
  it('creates the global CSS target and injects the anchored block', () => {
    const dir = createTmpDir();
    try {
      const cssFile = join(dir, 'global.css');
      const issue = makeIssue({
        ruleId: 'wcag/focus-appearance',
        line: 1,
        column: 1,
        fix: {
          kind: 'css-anchor',
          description: 'Inject focus-ring CSS',
          targetFile: cssFile,
          anchor: '/* @slop-audit:v1.0.0:fix:focus-ring */',
        },
      });
      const result = applyFocusRingFix(issue);
      expect(result.applied).toBe(true);
      const content = readFileSync(cssFile, 'utf-8');
      expect(content).toContain('/* @slop-audit:v1.0.0:fix:focus-ring */');
      expect(content).toContain(':focus-visible');
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('is idempotent when the anchor already exists', () => {
    const dir = createTmpDir();
    try {
      const cssFile = join(dir, 'global.css');
      writeFileSync(
        cssFile,
        '/* @slop-audit:v1.0.0:fix:focus-ring */\n:focus-visible { outline: 2px solid currentColor; }\n',
      );
      const issue = makeIssue({
        ruleId: 'wcag/focus-appearance',
        line: 1,
        column: 1,
        fix: {
          kind: 'css-anchor',
          description: 'Inject focus-ring CSS',
          targetFile: cssFile,
          anchor: '/* @slop-audit:v1.0.0:fix:focus-ring */',
        },
      });
      const result = applyFocusRingFix(issue);
      expect(result.applied).toBe(false);
      expect(result.reason).toContain('already present');
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe('applyFixes orchestrator', () => {
  it('applies a use-client fix to a source file', () => {
    const dir = createTmpDir();
    try {
      const filePath = join(dir, 'Page.tsx');
      writeFileSync(filePath, 'export function Page() { return <div />; }\n');
      const issue = makeIssue({
        ruleId: 'logic/boundary-violation',
        line: 1,
        column: 1,
        filePath,
        fix: {
          kind: 'insert',
          description: "Add 'use client' directive",
          targetFile: filePath,
          anchor: '"use client";',
        },
      });
      const results = applyFixes([issue], makeConfig());
      expect(results).toHaveLength(1);
      expect(results[0].applied).toHaveLength(1);
      expect(results[0].skipped).toHaveLength(0);
      const content = readFileSync(filePath, 'utf-8');
      expect(content.startsWith('"use client";\n')).toBe(true);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('applies a layout-token fix to a source file', () => {
    const dir = createTmpDir();
    try {
      const filePath = join(dir, 'Box.tsx');
      writeFileSync(filePath, 'export function Box() { return <div className="p-[13px]" />; }\n');
      const issue = makeIssue({
        ruleId: 'visual/arbitrary-escape',
        line: 1,
        column: 1,
        filePath,
        fix: {
          kind: 'replace',
          description: 'Replace layout arbitrary value(s) with design-system tokens',
          targetFile: filePath,
          anchor: 'p-[13px]',
          replacement: 'p-3',
        },
      });
      const results = applyFixes([issue], makeConfig());
      expect(results[0].applied).toHaveLength(1);
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('className="p-3"');
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('applies a css-anchor fix to a shared CSS file', () => {
    const dir = createTmpDir();
    try {
      const cssFile = join(dir, 'global.css');
      const issue = makeIssue({
        ruleId: 'wcag/focus-appearance',
        line: 1,
        column: 1,
        filePath: 'Button.tsx',
        fix: {
          kind: 'css-anchor',
          description: `Inject focus-ring CSS into ${cssFile}`,
          targetFile: cssFile,
          anchor: '/* @slop-audit:v1.0.0:fix:focus-ring */',
        },
      });
      const results = applyFixes([issue], makeConfig());
      expect(results[0].applied).toHaveLength(1);
      expect(existsSync(cssFile)).toBe(true);
      const content = readFileSync(cssFile, 'utf-8');
      expect(content).toContain(':focus-visible');
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe('--fix CLI integration', () => {
  beforeAll(assertDistBuilt);

  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('applies safe fixes and reports remaining issues', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    const cssFile = join(dir, 'src', 'global.css');
    const config = {
      ...DEFAULT_CONFIG,
      globalCssTarget: cssFile,
    };
    writeFileSync(join(dir, 'slop-audit.config.mjs'), serializeConfig(config));

    writeFileSync(
      join(dir, 'src', 'Page.tsx'),
      `export function Page() {
  const [x, setX] = useState(0);
  return (
    <div>
      <div className="p-[13px]" />
      <button className="outline-none">click</button>
    </div>
  );
}
`,
    );

    const { exitCode, stderr } = await run(['--fix', '--workspace', dir, '--format', 'json']);
    expect(stderr).toMatch(/Applied \d+ fix\(es\) across \d+ file\(s\)/);

    const pageContent = readFileSync(join(dir, 'src', 'Page.tsx'), 'utf-8');
    expect(pageContent.trimStart().startsWith('"use client";')).toBe(true);
    expect(pageContent).toContain('className="p-3"');

    expect(existsSync(cssFile)).toBe(true);
    const cssContent = readFileSync(cssFile, 'utf-8');
    expect(cssContent).toContain('/* @slop-audit:v1.0.0:fix:focus-ring */');

    // outline-none remains on the button because no focus-ring class was added.
    expect(pageContent).toContain('outline-none');

    expect(exitCode).toBe(0);
  });
});

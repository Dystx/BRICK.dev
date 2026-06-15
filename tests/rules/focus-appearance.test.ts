import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { focusAppearanceRule } from '../../src/rules/wcag/focus-appearance';
import type { Issue, ResolvedConfig, RuleContext } from '../../src/types';

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

async function runRule(
  source: string,
  config: ResolvedConfig,
  fileName = 'Component.tsx',
): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-focus-appearance-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    const ruleContext = focusAppearanceRule.create(context);
    return focusAppearanceRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('wcag/focus-appearance', () => {
  it('flags <button className="outline-none" />', async () => {
    const source = `export function Form() { return <button className="outline-none" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('wcag/focus-appearance');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].aiSpecific).toBe(false);
    expect(issues[0].message).toBe(
      "Interactive 'button' removes focus outline without adding a focus ring",
    );
  });

  it('flags <button className="focus:outline-none" />', async () => {
    const source = `export function Form() { return <button className="focus:outline-none" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('wcag/focus-appearance');
  });

  it('does not flag <button className="outline-none focus:ring-2" />', async () => {
    const source = `export function Form() { return <button className="outline-none focus:ring-2" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag <button className="focus:outline-none focus-visible:ring-2" />', async () => {
    const source = `export function Form() { return <button className="focus:outline-none focus-visible:ring-2" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag a plain <button />', async () => {
    const source = `export function Form() { return <button />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags focus-visible:outline-none without a focus ring', async () => {
    const source = `export function Form() { return <button className="focus-visible:outline-none" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });
});

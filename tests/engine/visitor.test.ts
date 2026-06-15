import { describe, expect, it } from 'vitest';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { join } from 'path';

const fixture = (name: string) => join(__dirname, `../fixtures/${name}.tsx`);

describe('extractFacts', () => {
  it('extracts components and class names', async () => {
    const { ast, nodeCount } = await parseFile(fixture('sample'));
    const facts = extractFacts(fixture('sample'), ast, nodeCount);
    expect(facts.components.length).toBe(2);
    expect(facts.staticClassNames.length).toBe(1);
    expect(facts.staticClassNames[0].value).toBe('flex items-center justify-center');
  });

  it('detects useState hook usage', async () => {
    const { ast, nodeCount } = await parseFile(fixture('sample'));
    const facts = extractFacts(fixture('sample'), ast, nodeCount);
    const form = facts.components.find((c) => c.name === 'Form');
    expect(form).toBeDefined();
    expect(form!.hookCalls.some((h) => h.name === 'useState')).toBe(true);
  });

  it('marks files without use client as server components', async () => {
    const { ast, nodeCount } = await parseFile(fixture('sample'));
    const facts = extractFacts(fixture('sample'), ast, nodeCount);
    expect(facts.components.every((c) => c.isServerComponent)).toBe(true);
  });

  it('flips isServerComponent when use client directive is present', async () => {
    const { ast, nodeCount } = await parseFile(fixture('use-client'));
    const facts = extractFacts(fixture('use-client'), ast, nodeCount);
    expect(facts.components.length).toBe(1);
    expect(facts.components[0].isServerComponent).toBe(false);
  });

  it('collects interactive elements with class names', async () => {
    const { ast, nodeCount } = await parseFile(fixture('interactive'));
    const facts = extractFacts(fixture('interactive'), ast, nodeCount);
    const tags = facts.interactiveElements.map((e) => e.tag).sort();
    expect(tags).toEqual(['a', 'button', 'input']);
    const button = facts.interactiveElements.find((e) => e.tag === 'button');
    expect(button).toBeDefined();
    expect(button!.classNames[0].value).toBe('btn-primary');
  });

  it('collects && chains with depth >= 3', async () => {
    const { ast, nodeCount } = await parseFile(fixture('logical-chain'));
    const facts = extractFacts(fixture('logical-chain'), ast, nodeCount);
    expect(facts.logicalExpressions.length).toBeGreaterThanOrEqual(1);
    expect(facts.logicalExpressions.some((l) => l.depth >= 3)).toBe(true);
  });

  it('collects zero-interpolation template literal class names', async () => {
    const { ast, nodeCount } = await parseFile(fixture('template-class'));
    const facts = extractFacts(fixture('template-class'), ast, nodeCount);
    expect(facts.staticClassNames.length).toBe(1);
    expect(facts.staticClassNames[0].value).toBe('container wrapper');
  });

  it('detects multiple top-level non-exported functions as components', async () => {
    const { ast, nodeCount } = await parseFile(fixture('non-exported'));
    const facts = extractFacts(fixture('non-exported'), ast, nodeCount);
    const names = facts.components.map((c) => c.name).sort();
    expect(names).toEqual(['First', 'Second', 'Third']);
  });

  it('reports line and column positions greater than 1:0', async () => {
    const { ast, nodeCount } = await parseFile(fixture('sample'));
    const facts = extractFacts(fixture('sample'), ast, nodeCount);
    const className = facts.staticClassNames[0];
    expect(className).toBeDefined();
    expect(className.line).toBeGreaterThan(1);
    expect(className.column).toBeGreaterThan(0);
  });

  it('bubbles hooks inside nested helpers up to the enclosing component', async () => {
    const { ast, nodeCount } = await parseFile(fixture('nested-hook'));
    const facts = extractFacts(fixture('nested-hook'), ast, nodeCount);
    const wrapper = facts.components.find((c) => c.name === 'Wrapper');
    expect(wrapper).toBeDefined();
    expect(wrapper!.hookCalls.some((h) => h.name === 'useId')).toBe(true);
  });

  it('marks both value and setter as referenced when used', async () => {
    const { ast, nodeCount } = await parseFile(fixture('state-both-referenced'));
    const facts = extractFacts(fixture('state-both-referenced'), ast, nodeCount);
    expect(facts.components).toHaveLength(1);
    const binding = facts.components[0].stateBindings[0];
    expect(binding).toBeDefined();
    expect(binding.valueName).toBe('count');
    expect(binding.setterName).toBe('setCount');
    expect(binding.valueReferenced).toBe(true);
    expect(binding.setterReferenced).toBe(true);
  });

  it('marks neither value nor setter as referenced when unused', async () => {
    const { ast, nodeCount } = await parseFile(fixture('state-none-referenced'));
    const facts = extractFacts(fixture('state-none-referenced'), ast, nodeCount);
    const binding = facts.components[0].stateBindings[0];
    expect(binding).toBeDefined();
    expect(binding.valueReferenced).toBe(false);
    expect(binding.setterReferenced).toBe(false);
  });

  it('marks only setter as referenced when value is unused', async () => {
    const { ast, nodeCount } = await parseFile(fixture('state-setter-only'));
    const facts = extractFacts(fixture('state-setter-only'), ast, nodeCount);
    const binding = facts.components[0].stateBindings[0];
    expect(binding).toBeDefined();
    expect(binding.valueReferenced).toBe(false);
    expect(binding.setterReferenced).toBe(true);
  });

  it('handles single-element useState pattern', async () => {
    const { ast, nodeCount } = await parseFile(fixture('state-single-element'));
    const facts = extractFacts(fixture('state-single-element'), ast, nodeCount);
    const binding = facts.components[0].stateBindings[0];
    expect(binding).toBeDefined();
    expect(binding.valueName).toBe('count');
    expect(binding.setterName).toBeUndefined();
    expect(binding.valueReferenced).toBe(true);
    expect(binding.setterReferenced).toBe(false);
  });

  it('ignores useState at module level', async () => {
    const { ast, nodeCount } = await parseFile(fixture('state-module-level'));
    const facts = extractFacts(fixture('state-module-level'), ast, nodeCount);
    expect(facts.components).toHaveLength(1);
    expect(facts.components[0].stateBindings).toHaveLength(0);
  });

  it('marks only value as referenced when setter is unused', async () => {
    const { ast, nodeCount } = await parseFile(fixture('state-value-only'));
    const facts = extractFacts(fixture('state-value-only'), ast, nodeCount);
    const binding = facts.components[0].stateBindings[0];
    expect(binding.valueReferenced).toBe(true);
    expect(binding.setterReferenced).toBe(false);
  });

  it('marks outer state as referenced when used in nested component', async () => {
    const { ast, nodeCount } = await parseFile(fixture('state-nested-reference'));
    const facts = extractFacts(fixture('state-nested-reference'), ast, nodeCount);
    const outer = facts.components.find((c) => c.name === 'Outer');
    expect(outer).toBeDefined();
    const binding = outer!.stateBindings[0];
    expect(binding.valueReferenced).toBe(true);
    expect(binding.setterReferenced).toBe(false);
  });

  it('does not treat function parameter as state reference', async () => {
    const { ast, nodeCount } = await parseFile(fixture('state-param-shadow'));
    const facts = extractFacts(fixture('state-param-shadow'), ast, nodeCount);
    const binding = facts.components[0].stateBindings[0];
    expect(binding.valueReferenced).toBe(false);
    expect(binding.setterReferenced).toBe(false);
  });

  it('tracks multiple useState bindings independently', async () => {
    const { ast, nodeCount } = await parseFile(fixture('state-multiple'));
    const facts = extractFacts(fixture('state-multiple'), ast, nodeCount);
    const binding = facts.components[0].stateBindings;
    expect(binding).toHaveLength(2);
    const nameBinding = binding.find((b) => b.valueName === 'name');
    const emailBinding = binding.find((b) => b.valueName === 'email');
    expect(nameBinding?.valueReferenced).toBe(true);
    expect(nameBinding?.setterReferenced).toBe(false);
    expect(emailBinding?.valueReferenced).toBe(false);
    expect(emailBinding?.setterReferenced).toBe(true);
  });

  it('marks initializer references to outer state before new binding shadows them', async () => {
    const { ast, nodeCount } = await parseFile(fixture('state-initializer-reference'));
    const facts = extractFacts(fixture('state-initializer-reference'), ast, nodeCount);
    const outer = facts.components.find((c) => c.name === 'Outer');
    expect(outer).toBeDefined();
    const binding = outer!.stateBindings[0];
    expect(binding.valueReferenced).toBe(true);
  });

  it('does not treat non-computed member property as state reference', async () => {
    const { ast, nodeCount } = await parseFile(fixture('state-member-property'));
    const facts = extractFacts(fixture('state-member-property'), ast, nodeCount);
    const binding = facts.components[0].stateBindings[0];
    expect(binding.valueName).toBe('target');
    expect(binding.valueReferenced).toBe(false);
    expect(binding.setterReferenced).toBe(false);
  });
});

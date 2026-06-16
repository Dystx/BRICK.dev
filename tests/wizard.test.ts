import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { detectProjectFacts, runWizard } from '../src/wizard';

describe('detectProjectFacts', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'slop-audit-wizard-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('defaults to react and plain-css with no project info', () => {
    const facts = detectProjectFacts(dir);
    expect(facts.framework).toBe('react');
    expect(facts.styling).toBe('plain-css');
    expect(facts.uiLibrary).toBe('none');
    expect(facts.include).toEqual(['**/*.{ts,tsx,js,jsx}']);
  });

  it('detects tailwind from package.json', () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { tailwindcss: '^3.0' } }),
    );
    const facts = detectProjectFacts(dir);
    expect(facts.styling).toBe('tailwind');
    expect(facts.baseSpacing).toBe(4);
  });

  it('detects vue framework', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { vue: '^3.0' } }));
    const facts = detectProjectFacts(dir);
    expect(facts.framework).toBe('vue');
  });

  it('detects shadcn/ui from components/ui directory', () => {
    mkdirSync(join(dir, 'components', 'ui'), { recursive: true });
    const facts = detectProjectFacts(dir);
    expect(facts.uiLibrary).toBe('shadcn/ui');
  });

  it('detects app and src include paths', () => {
    mkdirSync(join(dir, 'app'), { recursive: true });
    mkdirSync(join(dir, 'src'), { recursive: true });
    const facts = detectProjectFacts(dir);
    expect(facts.include).toContain('app/**/*.{ts,tsx,js,jsx}');
    expect(facts.include).toContain('src/**/*.{ts,tsx,js,jsx}');
  });
});

describe('runWizard', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'slop-audit-wizard-run-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns a config based on wizard answers', async () => {
    // Answers: framework=react, styling=tailwind, uiLibrary=none, baseSpacing=8, typeScaleRatio=1.25,
    //          arbitraryTolerance=strict, paths=src, strictness=brutal
    const answers = ['react', 'tailwind', 'none', '8', '1.25', 'strict', 'src', 'brutal'];
    const output = { write: () => {} } as unknown as NodeJS.WritableStream;

    const config = await runWizard(dir, { output, answers });

    expect(config.framework).toBe('react');
    expect(config.styling).toBe('tailwind');
    expect(config.uiLibrary).toBeUndefined();
    expect(config.baseSpacing).toBe(8);
    expect(config.typeScaleRatio).toBe(1.25);
    expect(config.arbitraryTolerance).toBe('strict');
    expect(config.include).toEqual(['src/**/*.{ts,tsx,js,jsx}']);
    expect(config.strictness).toBe('brutal');
  });
});

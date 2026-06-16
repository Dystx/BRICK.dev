import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { ResolvedConfig } from './types.js';
import { DEFAULT_CONFIG } from './config.js';

export interface WizardOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  answers?: string[];
}

export interface DetectedProjectFacts {
  framework: string;
  styling: string;
  uiLibrary: string;
  baseSpacing: number;
  include: string[];
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readPackageJson(cwd: string): PackageJson | undefined {
  const path = join(cwd, 'package.json');
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as PackageJson;
  } catch {
    return undefined;
  }
}

function hasDependency(pkg: PackageJson | undefined, name: string): boolean {
  if (!pkg) return false;
  return (
    !!(pkg.dependencies && Object.prototype.hasOwnProperty.call(pkg.dependencies, name)) ||
    !!(pkg.devDependencies && Object.prototype.hasOwnProperty.call(pkg.devDependencies, name))
  );
}

function hasFilesWithExt(cwd: string, ext: string): boolean {
  try {
    const entries = readdirSync(cwd);
    for (const entry of entries) {
      const full = join(cwd, entry);
      const stat = statSync(full);
      if (stat.isDirectory() && entry !== 'node_modules' && entry !== '.git' && entry !== 'dist') {
        if (hasFilesWithExt(full, ext)) return true;
      } else if (stat.isFile() && entry.endsWith(ext)) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function detectIncludePaths(cwd: string): string[] {
  const pattern = '**/*.{ts,tsx,js,jsx,vue,svelte,astro}';
  const paths: string[] = [];
  if (existsSync(join(cwd, 'app'))) paths.push(`app/${pattern}`);
  if (existsSync(join(cwd, 'src'))) paths.push(`src/${pattern}`);
  if (existsSync(join(cwd, 'components'))) paths.push(`components/${pattern}`);
  if (paths.length === 0) paths.push(pattern);
  return paths;
}

export function detectProjectFacts(cwd: string): DetectedProjectFacts {
  const pkg = readPackageJson(cwd);

  let framework = 'react';
  if (hasDependency(pkg, 'vue')) framework = 'vue';
  else if (hasDependency(pkg, 'svelte')) framework = 'svelte';
  else if (hasDependency(pkg, 'solid-js')) framework = 'solid';
  else if (hasDependency(pkg, '@builder.io/qwik') || hasDependency(pkg, 'qwik')) framework = 'qwik';

  let styling = 'plain-css';
  if (hasDependency(pkg, 'tailwindcss')) styling = 'tailwind';
  else if (hasDependency(pkg, 'styled-components')) styling = 'styled-components';
  else if (hasDependency(pkg, '@emotion/react') || hasDependency(pkg, '@emotion/styled')) {
    styling = 'emotion';
  } else if (hasFilesWithExt(cwd, '.module.css')) {
    styling = 'css-modules';
  }

  let uiLibrary = 'none';
  if (existsSync(join(cwd, 'components', 'ui'))) uiLibrary = 'shadcn/ui';
  else if (hasDependency(pkg, '@mui/material')) uiLibrary = 'mui';
  else if (hasDependency(pkg, 'antd')) uiLibrary = 'ant-design';
  else if (hasDependency(pkg, '@chakra-ui/react')) uiLibrary = 'chakra';
  else if (hasDependency(pkg, '@radix-ui/themes')) uiLibrary = 'radix';

  const baseSpacing = styling === 'tailwind' ? 4 : 8;

  return {
    framework,
    styling,
    uiLibrary,
    baseSpacing,
    include: detectIncludePaths(cwd),
  };
}

async function ask(
  rl: ReturnType<typeof createInterface>,
  question: string,
  defaultValue: string,
): Promise<string> {
  return new Promise((resolvePromise) => {
    rl.question(`${question} [${defaultValue}] `, (answer) => {
      resolvePromise(answer.trim() || defaultValue);
    });
  });
}

async function askChoice(
  rl: ReturnType<typeof createInterface>,
  question: string,
  options: string[],
  defaultValue: string,
): Promise<string> {
  const optionsText = options.map((o) => (o === defaultValue ? `*${o}*` : o)).join(' / ');
  const answer = await ask(rl, `${question} (${optionsText})`, defaultValue);
  const normalized = options.find((o) => o.toLowerCase() === answer.toLowerCase());
  return normalized ?? defaultValue;
}

async function askNumber(
  rl: ReturnType<typeof createInterface>,
  question: string,
  defaultValue: number,
): Promise<number> {
  const answer = await ask(rl, question, String(defaultValue));
  const parsed = parseFloat(answer);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function buildDetectedConfig(cwd: string): ResolvedConfig {
  const detected = detectProjectFacts(cwd);
  return {
    ...DEFAULT_CONFIG,
    framework: detected.framework === 'other' ? undefined : detected.framework,
    include: detected.include,
    styling: detected.styling,
    uiLibrary: detected.uiLibrary === 'none' ? undefined : detected.uiLibrary,
    baseSpacing: detected.baseSpacing,
    typeScaleRatio: 1.2,
    arbitraryTolerance: 'balanced',
    strictness: 'balanced',
  };
}

export async function runWizard(cwd: string, options: WizardOptions = {}): Promise<ResolvedConfig> {
  const detected = detectProjectFacts(cwd);
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const answerQueue = options.answers ? [...options.answers] : undefined;

  let answerIndex = 0;
  async function nextAnswer(_question: string, defaultValue: string): Promise<string> {
    if (answerQueue) {
      const value = answerQueue[answerIndex++] ?? '';
      return value.trim() || defaultValue;
    }
    throw new Error('Unexpected wizard prompt without answers');
  }

  async function nextChoice(
    _question: string,
    optionsList: string[],
    defaultValue: string,
  ): Promise<string> {
    const answer = await nextAnswer(_question, defaultValue);
    const normalized = optionsList.find((o) => o.toLowerCase() === answer.toLowerCase());
    return normalized ?? defaultValue;
  }

  async function nextNumber(_question: string, defaultValue: number): Promise<number> {
    const answer = await nextAnswer(_question, String(defaultValue));
    const parsed = parseFloat(answer);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }

  const useReadline = !answerQueue;
  const rl = useReadline ? createInterface({ input, output }) : undefined;

  const askFn = useReadline
    ? (q: string, d: string) => ask(rl!, q, d)
    : nextAnswer;
  const askChoiceFn = useReadline
    ? (q: string, o: string[], d: string) => askChoice(rl!, q, o, d)
    : nextChoice;
  const askNumberFn = useReadline
    ? (q: string, d: number) => askNumber(rl!, q, d)
    : nextNumber;

  try {
    output.write('No slop-audit config found. Let\'s calibrate for this project.\n\n');

    const framework = await askChoiceFn('Framework?', ['react', 'vue', 'svelte', 'solid', 'qwik', 'other'], detected.framework);
    const styling = await askChoiceFn(
      'Styling solution?',
      ['tailwind', 'css-modules', 'styled-components', 'emotion', 'plain-css'],
      detected.styling,
    );
    const uiLibrary = await askChoiceFn(
      'UI library / design system?',
      ['shadcn/ui', 'mui', 'ant-design', 'chakra', 'radix', 'custom', 'none'],
      detected.uiLibrary,
    );
    const baseSpacing = await askNumberFn('Base spacing grid (px)?', detected.baseSpacing);
    const typeScaleRatio = await askChoiceFn(
      'Type scale ratio?',
      ['1.2', '1.25', '1.333', 'custom'],
      '1.2',
    );
    const arbitraryTolerance = await askChoiceFn(
      'Arbitrary value tolerance?',
      ['strict', 'balanced', 'permissive'],
      'balanced',
    );
    const pathsChoice = await askChoiceFn(
      'Paths to scan?',
      ['auto', 'src', 'app', 'custom'],
      'auto',
    );
    const strictness = await askChoiceFn(
      'Strictness?',
      ['brutal', 'balanced', 'gentle'],
      'balanced',
    );

    const include = pathsChoice === 'auto' ? detected.include : pathsChoice === 'custom' ? ['**/*.{ts,tsx,js,jsx,vue,svelte,astro}'] : [`${pathsChoice}/**/*.{ts,tsx,js,jsx,vue,svelte,astro}`];

    return {
      ...DEFAULT_CONFIG,
      framework: framework === 'other' ? undefined : framework,
      include,
      styling,
      uiLibrary: uiLibrary === 'none' ? undefined : uiLibrary,
      baseSpacing,
      typeScaleRatio: parseFloat(typeScaleRatio),
      arbitraryTolerance: arbitraryTolerance as 'strict' | 'balanced' | 'permissive',
      strictness: strictness as 'brutal' | 'balanced' | 'gentle',
    };
  } finally {
    rl?.close();
  }
}

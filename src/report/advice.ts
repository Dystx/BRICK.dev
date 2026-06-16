import type { Category, ProjectReport } from '../types.js';
import { generateFixDiffs } from './diff.js';
import { formatGirBoundaries } from './gir.js';

const remediation: Record<Category, string> = {
  visual:
    'Audit arbitrary Tailwind values and inline styles; replace one-off values with design tokens.',
  typo:
    'Standardize type scales and align headings/body text with the design system typography scale.',
  motion:
    'Use motion tokens for durations, easings, transitions, and animations instead of arbitrary values.',
  wcag:
    'Add focus rings and minimum target sizes; verify color contrast and semantic landmarks.',
  layout:
    'Reduce magic numbers and hard-coded spacing; prefer grid/flex patterns from the design system.',
  component:
    'Consolidate similar components, remove dead variants, and enforce prop naming conventions.',
  logic: 'Review hook usage and remove zombie state; simplify conditional rendering chains.',
  arch:
    'Break deep module hierarchies and align file structure with feature boundaries.',
  perf:
    'Eliminate unnecessary re-renders, defer non-critical work, and audit bundle imports.',
};

function formatNaturalLanguage(report: ProjectReport): string {
  const categories = (Object.entries(report.categoryScores) as [Category, number][])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  if (categories.length === 0) {
    return 'No problem categories detected — great job!';
  }

  const lines: string[] = [];
  for (const [category, score] of categories) {
    const scoreText = score.toFixed(1);
    lines.push(`• ${category} (${scoreText}): ${remediation[category]}`);
  }

  lines.push('');
  lines.push(
    `Priority order: ${categories
      .map(([category, score]) => `${category} (${score.toFixed(1)})`)
      .join(', ')}.`,
  );

  return lines.join('\n');
}

function formatAstPatches(report: ProjectReport): string {
  const patches = generateFixDiffs(report).filter((patch) => patch.diff.length > 0);
  if (patches.length === 0) {
    return 'No safe localized patches available.';
  }

  const lines: string[] = [];
  for (const patch of patches) {
    lines.push(patch.diff);
    if (patch.skipped.length > 0) {
      lines.push('# Skipped patches:');
      for (const skipped of patch.skipped) {
        lines.push(`#   [${skipped.ruleId}] ${skipped.reason}`);
      }
    }
  }
  return lines.join('\n');
}

export function formatAdvice(report: ProjectReport): string {
  const sections: string[] = [];

  sections.push('=== Tier 1: AST Patch (Unified Diff) ===');
  sections.push('');
  sections.push(formatAstPatches(report));
  sections.push('');

  sections.push('=== Tier 2: Natural Language Guidance ===');
  sections.push('');
  sections.push(formatNaturalLanguage(report));
  sections.push('');

  sections.push('=== Tier 3: GIR Boundary Markers ===');
  sections.push('');
  const gir = formatGirBoundaries(report);
  sections.push(gir.length > 0 ? gir : 'No clean-room refactor boundaries identified.');
  sections.push('');

  return sections.join('\n');
}

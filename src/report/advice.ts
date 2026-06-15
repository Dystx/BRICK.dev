import type { Category, ProjectReport } from '../types.js';

const remediation: Record<Category, string> = {
  visual:
    'Audit arbitrary Tailwind values and inline styles; replace one-off values with design tokens.',
  typo:
    'Standardize type scales and align headings/body text with the design system typography scale.',
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

export function formatAdvice(report: ProjectReport): string {
  const categories = (Object.entries(report.categoryScores) as [Category, number][])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  if (categories.length === 0) {
    return 'No problem categories detected — great job!';
  }

  const lines: string[] = [];
  lines.push('Remediation advice');
  lines.push('');

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

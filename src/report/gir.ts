import type { Category, ProjectReport } from '../types.js';

const STRUCTURAL_CATEGORIES: Category[] = [
  'visual',
  'layout',
  'logic',
  'arch',
  'perf',
];

export function formatGirBoundaries(report: ProjectReport): string {
  const markers: string[] = [];

  for (const component of report.components) {
    if (component.adjustedScore <= 0) continue;

    const fileIssues = report.issues.filter(
      (issue) => issue.filePath === component.filePath,
    );
    const hasStructural = fileIssues.some((issue) =>
      STRUCTURAL_CATEGORIES.includes(issue.category),
    );
    if (!hasStructural) continue;

    markers.push(
      `<!-- GIR-BOUNDARY: clean-room refactor ${component.filePath} (score ${component.adjustedScore.toFixed(1)}) -->`,
    );
  }

  if (markers.length === 0) {
    return '';
  }

  return markers.join('\n');
}

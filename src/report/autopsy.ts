import type { Issue, ProjectReport } from '../types.js';

export interface FailureMode {
  name: string;
  description: string;
  ruleIds: string[];
}

const FAILURE_MODES: FailureMode[] = [
  {
    name: 'Token bias',
    description: 'preferring className strings over importing components',
    ruleIds: ['visual/arbitrary-escape', 'visual/generic-centering', 'visual/forced-layout'],
  },
  {
    name: 'State soup',
    description: 'declaring more state than needed',
    ruleIds: ['logic/zombie-state'],
  },
  {
    name: 'Ghost logic',
    description: 'defensive guards and effects that should be derived or removed',
    ruleIds: ['logic/ghost-defensive'],
  },
  {
    name: 'Inline temptation',
    description: 'styles, handlers, or logic inlined instead of using tokens',
    ruleIds: ['typo/calc-raw-px'],
  },
  {
    name: 'Pattern lock-in',
    description: 'copying the same bad layout or logic pattern across files',
    ruleIds: ['visual/generic-centering', 'visual/forced-layout', 'layout/gap-monopoly'],
  },
  {
    name: 'Constraint blindness',
    description: 'ignoring accessibility, performance, or brand constraints',
    ruleIds: ['wcag/target-size', 'wcag/focus-appearance', 'wcag/focus-obscured'],
  },
];

interface ModeResult {
  name: string;
  description: string;
  count: number;
  sample: string;
}

function matchesMode(issue: Issue, mode: FailureMode): boolean {
  return mode.ruleIds.includes(issue.ruleId);
}

export function analyzeAutopsy(report: ProjectReport): ModeResult[] {
  return FAILURE_MODES.map((mode) => {
    const issues = report.issues.filter((issue) => matchesMode(issue, mode));
    const count = issues.length;
    const sample = issues[0]?.message ?? '';
    return {
      name: mode.name,
      description: mode.description,
      count,
      sample,
    };
  }).filter((mode) => mode.count > 0);
}

export function formatAutopsy(report: ProjectReport): string {
  const modes = analyzeAutopsy(report);

  const lines: string[] = [];
  lines.push('AI Autopsy');
  lines.push('');

  if (modes.length === 0) {
    lines.push('No classic AI failure modes detected.');
  } else {
    lines.push(`This codebase shows ${modes.length} classic AI failure mode${modes.length === 1 ? '' : 's'}:`
);
    lines.push('');
    for (let i = 0; i < modes.length; i++) {
      const mode = modes[i];
      const sample = mode.sample ? ` — e.g., "${mode.sample}"` : '';
      lines.push(`${i + 1}. ${mode.name.padEnd(18, ' ')} → ${mode.count} issue${mode.count === 1 ? '' : 's'}${sample}`);
    }
  }

  lines.push('');
  lines.push(`Slop Index: ${Math.round(report.slopIndex)}%`);

  return lines.join('\n');
}

import { VERSION, type Issue, type ProjectReport, type Severity } from '../types.js';

const severityToLevel: Record<Severity, string> = {
  high: 'error',
  medium: 'warning',
  low: 'note',
};

export function formatSarif(report: ProjectReport): string {
  const uniqueIssues = new Map<string, Issue>();
  for (const issue of report.issues) {
    if (!uniqueIssues.has(issue.ruleId)) {
      uniqueIssues.set(issue.ruleId, issue);
    }
  }

  const rules = Array.from(uniqueIssues.values()).map((issue) => ({
    id: issue.ruleId,
    properties: {
      category: issue.category,
      aiSpecific: issue.aiSpecific,
    },
  }));

  const ruleIndexById = new Map<string, number>();
  for (let i = 0; i < rules.length; i++) {
    ruleIndexById.set(rules[i].id, i);
  }

  const results = report.issues.map((issue) => ({
    ruleId: issue.ruleId,
    ruleIndex: ruleIndexById.get(issue.ruleId),
    level: severityToLevel[issue.severity],
    message: {
      text: issue.message,
    },
    ...(issue.advice ? { fixes: [{ description: { text: issue.advice } }] } : {}),
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: issue.filePath ?? '',
          },
          region: {
            startLine: issue.line,
            startColumn: issue.column,
          },
        },
      },
    ],
  }));

  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'slop-audit',
            version: VERSION,
            informationUri: 'https://github.com/brickdotdev/slop-audit',
            rules,
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

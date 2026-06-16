import { VERSION, type Issue, type ProjectReport, type Severity } from '../types.js';

interface SarifRule {
  id: string;
  shortDescription: { text: string };
  properties: {
    aiSpecific: boolean;
    category: string;
    severity: Severity;
  };
}

interface SarifResult {
  ruleId: string;
  ruleIndex: number;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      region: { startLine: number; startColumn: number };
    };
  }>;
}

interface SarifLog {
  version: '2.1.0';
  $schema: string;
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version: string;
        informationUri: string;
        rules: SarifRule[];
      };
    };
    results: SarifResult[];
  }>;
}

const severityToLevel: Record<Severity, 'error' | 'warning' | 'note'> = {
  high: 'error',
  medium: 'warning',
  low: 'note',
};

export function formatSarif(report: ProjectReport): string {
  const ruleById = new Map<string, Issue>();
  for (const issue of report.issues) {
    if (!ruleById.has(issue.ruleId)) {
      ruleById.set(issue.ruleId, issue);
    }
  }

  const rules: SarifRule[] = Array.from(ruleById.values()).map((issue) => ({
    id: issue.ruleId,
    shortDescription: {
      text: issue.message,
    },
    properties: {
      aiSpecific: issue.aiSpecific,
      category: issue.category,
      severity: issue.severity,
    },
  }));

  const ruleIndexById = new Map<string, number>();
  for (let i = 0; i < rules.length; i++) {
    ruleIndexById.set(rules[i].id, i);
  }

  const results: SarifResult[] = report.issues.map((issue) => ({
    ruleId: issue.ruleId,
    ruleIndex: ruleIndexById.get(issue.ruleId)!,
    level: severityToLevel[issue.severity],
    message: {
      text: issue.message,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: issue.filePath ?? 'unknown',
          },
          region: {
            startLine: issue.line,
            startColumn: issue.column,
          },
        },
      },
    ],
  }));

  const sarif: SarifLog = {
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

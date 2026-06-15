import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Project, SyntaxKind } from "ts-morph";
import { extractComponents } from "../src/extractor/component";
import { parseClassName } from "../src/extractor/className";
import { parseStyle } from "../src/extractor/style";

const FIXTURE_DIR = join(process.cwd(), "tests", "fixtures");

const SPACING_UTILITY_RE = /^(?:p|m|gap|w|h)-\[(\d+)px\]$/;
const FONT_SIZE_UTILITY_RE = /^text-\[(\d+)px\]$/;
const COLOR_UTILITY_RE = /^(?:bg|text)-\[(#[0-9a-fA-F]{3,8})\]$/;
const STYLE_NUMERIC_RE = /(\d+)/;

const SPACING_STYLE_KEYS = new Set([
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "gap",
]);

function extractNumeric(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = value.match(STYLE_NUMERIC_RE);
  if (!match) return undefined;
  return parseInt(match[1], 10);
}

function extractDimensions(sourceText: string) {
  const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
  project.createSourceFile("fixture.tsx", sourceText);

  const spacing: number[] = [];
  const fontSizes: number[] = [];
  const colors: string[] = [];

  for (const component of extractComponents(project)) {
    for (const attr of component.node.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
      const className = parseClassName(attr);
      if (className) {
        for (const util of className.utilities) {
          const spacingMatch = util.match(SPACING_UTILITY_RE);
          if (spacingMatch) spacing.push(parseInt(spacingMatch[1], 10));

          const textMatch = util.match(FONT_SIZE_UTILITY_RE);
          if (textMatch) fontSizes.push(parseInt(textMatch[1], 10));

          const colorMatch = util.match(COLOR_UTILITY_RE);
          if (colorMatch) colors.push(colorMatch[1]);
        }
      }

      const style = parseStyle(attr);
      if (style) {
        for (const [key, value] of Object.entries(style)) {
          if (SPACING_STYLE_KEYS.has(key)) {
            const n = extractNumeric(value);
            if (n !== undefined) spacing.push(n);
          }
          if (key === "fontSize") {
            const n = extractNumeric(value);
            if (n !== undefined) fontSizes.push(n);
          }
        }
      }
    }
  }

  return { spacing, fontSizes, colors };
}

function histogram(values: (string | number)[]): Record<string, number> {
  const map = new Map<string, number>();
  for (const v of values) {
    const key = String(v);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Object.fromEntries(map);
}

function main() {
  const spacingValues: number[] = [];
  const fontSizeValues: number[] = [];
  const colorValues: string[] = [];

  const files = readdirSync(FIXTURE_DIR).filter((file) => file.endsWith(".tsx"));

  for (const file of files) {
    const dims = extractDimensions(readFileSync(join(FIXTURE_DIR, file), "utf-8"));
    spacingValues.push(...dims.spacing);
    fontSizeValues.push(...dims.fontSizes);
    colorValues.push(...dims.colors);
  }

  const corpus = {
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    sampleCount: files.length,
    spacingHistogram: histogram(spacingValues),
    fontSizeHistogram: histogram(fontSizeValues),
    colorHistogram: histogram(colorValues),
  };

  writeFileSync(join(process.cwd(), "corpus", "baseline.json"), JSON.stringify(corpus, null, 2) + "\n");
}

main();

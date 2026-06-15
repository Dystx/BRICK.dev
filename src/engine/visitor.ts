import { readFileSync } from 'fs';
import type { Module } from '@swc/core';
import type {
  ScanFacts,
  ComponentFacts,
  ClassNameFact,
  ElementFact,
  HookFact,
  LogicalExpressionFact,
  StateBinding,
} from '../types';

type AnyNode = unknown;

interface FunctionFrame extends ComponentFacts {
  isComponent: boolean;
  bindings: Set<string>;
}

interface WalkContext {
  stack: FunctionFrame[];
  useClient: boolean;
}

function isObject(node: AnyNode): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

function isHookName(name: string): boolean {
  return name.startsWith('use') && name.length > 3 && name[3] === name[3].toUpperCase();
}

function getNodeType(node: AnyNode): string | undefined {
  if (isObject(node) && typeof node.type === 'string') {
    return node.type;
  }
  return undefined;
}

function spanStart(node: AnyNode): number | undefined {
  if (isObject(node) && isObject(node.span) && typeof node.span.start === 'number') {
    return node.span.start as number;
  }
  return undefined;
}

function buildLineOffsets(source: string): number[] {
  const offsets: number[] = [0];
  let byteOffset = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '\n') {
      byteOffset += Buffer.byteLength(char, 'utf-8');
      offsets.push(byteOffset);
    } else if (char === '\r') {
      byteOffset += Buffer.byteLength(char, 'utf-8');
      if (i + 1 < source.length && source[i + 1] === '\n') {
        byteOffset += Buffer.byteLength('\n', 'utf-8');
        i++;
      }
      offsets.push(byteOffset);
    } else {
      byteOffset += Buffer.byteLength(char, 'utf-8');
    }
  }
  return offsets;
}

function positionFromOffset(offset: number, lineOffsets: number[]): { line: number; column: number } {
  // SWC spans are 1-based byte offsets; convert to 0-based.
  const byteOffset = Math.max(0, offset - 1);

  let low = 1;
  let high = lineOffsets.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (lineOffsets[mid] <= byteOffset) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  const line = low;
  const column = byteOffset - lineOffsets[line - 1] + 1;
  return { line, column };
}

function positionFrom(node: AnyNode, lineOffsets: number[]): { line: number; column: number } {
  const start = spanStart(node);
  if (start === undefined) return { line: 1, column: 1 };
  return positionFromOffset(start, lineOffsets);
}

function containsJsx(node: AnyNode): boolean {
  if (!isObject(node)) return false;
  const type = getNodeType(node);
  if (type === 'JSXElement' || type === 'JSXFragment') return true;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (containsJsx(item)) return true;
      }
    } else if (isObject(value)) {
      if (containsJsx(value)) return true;
    }
  }
  return false;
}

function stringLiteralValue(node: AnyNode): string | undefined {
  if (isObject(node) && node.type === 'StringLiteral' && typeof node.value === 'string') {
    return node.value as string;
  }
  return undefined;
}

function templateLiteralValue(node: AnyNode): string | undefined {
  if (!isObject(node) || node.type !== 'TemplateLiteral') return undefined;
  const exprs = node.expressions;
  if (Array.isArray(exprs) && exprs.length === 0) {
    const quasis = node.quasis;
    if (Array.isArray(quasis) && quasis.length > 0 && isObject(quasis[0]) && typeof quasis[0].raw === 'string') {
      const cooked = quasis[0].cooked;
      return (typeof cooked === 'string' ? cooked : (quasis[0].raw as string));
    }
  }
  return undefined;
}

function staticClassValue(node: AnyNode): string | undefined {
  return stringLiteralValue(node) ?? templateLiteralValue(node);
}

function jsxAttrName(node: AnyNode): string | undefined {
  if (!isObject(node) || node.type !== 'JSXAttribute') return undefined;
  const name = node.name;
  if (isObject(name) && typeof name.value === 'string') {
    return name.value as string;
  }
  if (isObject(name) && typeof (name as Record<string, unknown>).name === 'string') {
    return (name as Record<string, unknown>).name as string;
  }
  return undefined;
}

function jsxElementName(node: AnyNode): string | undefined {
  if (!isObject(node)) return undefined;
  if (node.type === 'JSXOpeningElement' || node.type === 'JSXClosingElement') {
    const name = node.name;
    if (isObject(name) && typeof name.value === 'string') {
      return name.value as string;
    }
  }
  if (node.type === 'JSXElement') {
    return jsxElementName(node.opening);
  }
  return undefined;
}

function unwrapJsxExpression(node: AnyNode): AnyNode {
  if (isObject(node) && node.type === 'JSXExpressionContainer') {
    return node.expression as AnyNode;
  }
  return node;
}

function getFunctionName(node: Record<string, unknown>): string | undefined {
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
    const id = node.identifier as AnyNode;
    if (isObject(id) && typeof id.value === 'string') {
      return id.value as string;
    }
  }
  return undefined;
}

function spanEnd(node: AnyNode): number | undefined {
  if (isObject(node) && isObject(node.span) && typeof node.span.end === 'number') {
    return node.span.end as number;
  }
  return undefined;
}

function sourceText(node: AnyNode, source: string): string {
  const start = spanStart(node);
  const end = spanEnd(node);
  if (start === undefined || end === undefined) return 'expr';
  return source.slice(Math.max(0, start - 1), Math.max(0, end - 1));
}

function binaryAndChainLength(node: AnyNode): number {
  if (!isObject(node) || node.type !== 'BinaryExpression' || node.operator !== '&&') {
    return 1;
  }
  const left = node.left as AnyNode;
  const right = node.right as AnyNode;
  return binaryAndChainLength(left) + binaryAndChainLength(right);
}

function collectChainText(node: AnyNode, source: string): string {
  return sourceText(node, source);
}

function isUseStateDeclarator(node: Record<string, unknown>): boolean {
  const init = node.init as AnyNode;
  if (!isObject(init) || init.type !== 'CallExpression') return false;
  const callee = init.callee as AnyNode;
  return (
    isObject(callee) &&
    callee.type === 'Identifier' &&
    typeof callee.value === 'string' &&
    callee.value === 'useState'
  );
}

function extractStateBinding(node: Record<string, unknown>, lineOffsets: number[]): StateBinding | undefined {
  const id = node.id as AnyNode;
  if (!isObject(id) || id.type !== 'ArrayPattern') return undefined;
  const elements = id.elements as AnyNode[];
  if (!Array.isArray(elements) || elements.length === 0) return undefined;

  const valueNode = elements[0];
  const setterNode = elements[1];
  let valueName: string | undefined;
  let setterName: string | undefined;

  if (isObject(valueNode) && valueNode.type === 'Identifier' && typeof valueNode.value === 'string') {
    valueName = valueNode.value as string;
  }
  if (
    elements.length >= 2 &&
    isObject(setterNode) &&
    setterNode.type === 'Identifier' &&
    typeof setterNode.value === 'string'
  ) {
    setterName = setterNode.value as string;
  }

  if (valueName === undefined && setterName === undefined) return undefined;

  const { line, column } = positionFrom(node, lineOffsets);
  return {
    valueName,
    setterName,
    line,
    column,
    valueReferenced: false,
    setterReferenced: false,
  };
}

export function extractFacts(filePath: string, ast: Module, nodeCount: number): ScanFacts {
  const source = readFileSync(filePath, 'utf-8');
  const lineOffsets = buildLineOffsets(source);

  const facts: ScanFacts = {
    filePath,
    astNodeCount: nodeCount,
    components: [],
    staticClassNames: [],
    interactiveElements: [],
    hooks: [],
    logicalExpressions: [],
  };

  const ctx: WalkContext = {
    stack: [],
    useClient: false,
  };

  function nearestComponent(): FunctionFrame | null {
    for (let i = ctx.stack.length - 1; i >= 0; i--) {
      if (ctx.stack[i].isComponent) {
        return ctx.stack[i];
      }
    }
    return null;
  }

  function nearestFrame(): FunctionFrame | null {
    return ctx.stack[ctx.stack.length - 1] ?? null;
  }

  function attachHook(hook: HookFact): void {
    facts.hooks.push(hook);
    const component = nearestComponent();
    if (component) {
      component.hookCalls.push(hook);
    }
  }

  function collectBindingNames(node: AnyNode): string[] {
    if (!isObject(node)) return [];
    if (node.type === 'Identifier' && typeof node.value === 'string') {
      return [node.value as string];
    }
    if (node.type === 'Parameter') {
      return collectBindingNames(node.pat);
    }
    if (node.type === 'ArrayPattern') {
      const names: string[] = [];
      const elements = node.elements as AnyNode[];
      if (Array.isArray(elements)) {
        for (const element of elements) {
          if (element != null) {
            names.push(...collectBindingNames(element));
          }
        }
      }
      return names;
    }
    if (node.type === 'AssignmentPattern') {
      return collectBindingNames(node.left);
    }
    return [];
  }

  function pushFrame(node: Record<string, unknown>): void {
    const name = getFunctionName(node);
    const { line, column } = positionFrom(node, lineOffsets);
    const bindings = new Set<string>();
    if (name) {
      bindings.add(name);
    }
    const params = node.params as AnyNode[];
    if (Array.isArray(params)) {
      for (const param of params) {
        for (const bindingName of collectBindingNames(param)) {
          bindings.add(bindingName);
        }
      }
    }
    ctx.stack.push({
      name,
      line,
      column,
      isServerComponent: !ctx.useClient,
      hookCalls: [],
      stateBindings: [],
      isComponent: containsJsx(node),
      bindings,
    });
  }

  function popFrame(): void {
    const frame = ctx.stack.pop();
    if (frame && frame.isComponent) {
      const { isComponent, bindings, ...component } = frame;
      facts.components.push(component);
    }
  }

  function isAndChainChild(parent: AnyNode): boolean {
    return isObject(parent) && parent.type === 'BinaryExpression' && parent.operator === '&&';
  }

  function containsNode(container: AnyNode, target: AnyNode): boolean {
    if (container === target) return true;
    if (!isObject(container)) return false;
    for (const value of Object.values(container)) {
      if (Array.isArray(value)) {
        if (value.some((item) => containsNode(item, target))) return true;
      } else if (isObject(value)) {
        if (containsNode(value, target)) return true;
      }
    }
    return false;
  }

  function isBindingSite(node: AnyNode, parent: AnyNode): boolean {
    if (!isObject(parent)) return false;
    if (parent.type === 'VariableDeclarator' && parent.id === node) return true;
    if (parent.type === 'AssignmentPattern' && parent.left === node) return true;
    if (parent.type === 'JSXAttribute' && parent.name === node) return true;
    if ((parent.type === 'ObjectProperty' || parent.type === 'Property') && parent.key === node) return true;
    if (parent.type === 'ArrayPattern') {
      const elements = parent.elements as AnyNode[];
      if (Array.isArray(elements) && elements.includes(node as object)) return true;
    }
    if (parent.type === 'Parameter') {
      const pat = parent.pat as AnyNode;
      if (pat === node) return true;
      if (containsNode(pat, node)) return true;
    }
    if (
      parent.type === 'FunctionDeclaration' ||
      parent.type === 'FunctionExpression' ||
      parent.type === 'ArrowFunctionExpression'
    ) {
      const params = parent.params as AnyNode[];
      if (Array.isArray(params)) {
        if (params.includes(node as object)) return true;
        if (params.some((param) => containsNode(param, node))) return true;
      }
    }
    return false;
  }

  function isNonComputedMemberProperty(node: AnyNode, parent: AnyNode): boolean {
    if (!isObject(parent)) return false;
    if ((parent.type === 'MemberExpression' || parent.type === 'JSXMemberExpression') && parent.property === node) {
      return !parent.computed;
    }
    return false;
  }

  function markStateReference(name: string): void {
    for (let i = ctx.stack.length - 1; i >= 0; i--) {
      const frame = ctx.stack[i];
      if (frame.bindings.has(name)) {
        if (frame.isComponent) {
          for (const binding of frame.stateBindings) {
            if (binding.valueName === name) {
              binding.valueReferenced = true;
            }
            if (binding.setterName === name) {
              binding.setterReferenced = true;
            }
          }
        }
        return;
      }
      if (frame.isComponent) {
        let matched = false;
        for (const binding of frame.stateBindings) {
          if (binding.valueName === name) {
            binding.valueReferenced = true;
            matched = true;
          }
          if (binding.setterName === name) {
            binding.setterReferenced = true;
            matched = true;
          }
        }
        if (matched) return;
      }
    }
  }

  function processNode(node: AnyNode, parent: AnyNode): boolean {
    if (!isObject(node)) return false;

    const type = getNodeType(node);

    // Detect "use client" directive at the top of the module.
    if (type === 'ExpressionStatement') {
      const expr = node.expression as AnyNode;
      if (isObject(expr) && expr.type === 'StringLiteral' && expr.value === 'use client') {
        ctx.useClient = true;
      }
    }

    // Detect hook calls and attach to the nearest enclosing component frame.
    if (type === 'CallExpression') {
      const callee = node.callee as AnyNode;
      if (isObject(callee) && callee.type === 'Identifier' && typeof callee.value === 'string' && isHookName(callee.value)) {
        const { line, column } = positionFrom(node, lineOffsets);
        attachHook({ name: callee.value as string, line, column });
      }
    }

    // Detect static className / class JSX attributes.
    if (type === 'JSXAttribute') {
      const attrName = jsxAttrName(node);
      if (attrName === 'className' || attrName === 'class') {
        const raw = node.value as AnyNode;
        const valueNode = unwrapJsxExpression(raw);
        const classValue = staticClassValue(valueNode);
        if (classValue !== undefined) {
          const { line, column } = positionFrom(node, lineOffsets);
          facts.staticClassNames.push({ value: classValue, line, column });
        }
      }
    }

    // Detect interactive elements.
    if (type === 'JSXOpeningElement') {
      const tag = jsxElementName(node);
      if (tag === 'button' || tag === 'a' || tag === 'input') {
        const attributes: Record<string, string | undefined> = {};
        const classNames: ClassNameFact[] = [];
        const attrs = node.attributes as AnyNode[];
        for (const attr of attrs) {
          if (!isObject(attr) || attr.type !== 'JSXAttribute') continue;
          const name = jsxAttrName(attr);
          if (!name) continue;
          const raw = attr.value as AnyNode;
          const valueNode = unwrapJsxExpression(raw);
          const staticValue = stringLiteralValue(valueNode);
          attributes[name] = staticValue;
          if (name === 'className' || name === 'class') {
            const classValue = staticClassValue(valueNode);
            if (classValue !== undefined) {
              const { line, column } = positionFrom(attr, lineOffsets);
              classNames.push({ value: classValue, line, column });
            }
          }
        }
        const { line, column } = positionFrom(node, lineOffsets);
        facts.interactiveElements.push({ tag: tag as string, attributes, classNames, line, column });
      }
    }

    // Detect deep && binary expression chains.
    if (type === 'BinaryExpression' && node.operator === '&&' && !isAndChainChild(parent)) {
      const depth = binaryAndChainLength(node);
      if (depth >= 3) {
        const { line, column } = positionFrom(node, lineOffsets);
        facts.logicalExpressions.push({
          depth,
          line,
          column,
          text: collectChainText(node, source),
        });
      }
    }

    // Detect variable bindings (including useState destructured bindings).
    if (type === 'VariableDeclarator') {
      const init = node.init as AnyNode;
      // Visit initializer first so references inside it are resolved before
      // the new binding names shadow outer names.
      visit(init, node);

      const id = node.id as AnyNode;
      const bindingNames = collectBindingNames(id);
      const frame = nearestFrame();
      if (frame) {
        for (const bindingName of bindingNames) {
          frame.bindings.add(bindingName);
        }
      }

      if (isUseStateDeclarator(node)) {
        const binding = extractStateBinding(node, lineOffsets);
        if (binding) {
          const component = nearestComponent();
          if (component) {
            component.stateBindings.push(binding);
          }
        }
      }

      // Skip walking the pattern itself; the identifiers there are bindings,
      // not references.
      return true;
    }

    // Mark references to tracked state bindings, but skip binding sites such as
    // variable declarators, function parameters, object property keys, and
    // non-computed member-expression properties.
    if (
      type === 'Identifier' &&
      typeof node.value === 'string' &&
      !isBindingSite(node, parent) &&
      !isNonComputedMemberProperty(node, parent)
    ) {
      markStateReference(node.value as string);
    }

    return false;
  }

  function visit(node: AnyNode, parent: AnyNode = null): void {
    if (!isObject(node)) return;

    const type = getNodeType(node);
    const isFunction = type === 'FunctionDeclaration' || type === 'FunctionExpression' || type === 'ArrowFunctionExpression';

    if (isFunction) {
      pushFrame(node);
    }

    const skipChildren = processNode(node, parent);

    if (!skipChildren) {
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            visit(item, node);
          }
        } else if (isObject(value)) {
          visit(value, node);
        }
      }
    }

    if (isFunction) {
      popFrame();
    }
  }

  visit(ast);

  return facts;
}

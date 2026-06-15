const { parseSync } = require('@swc/core');
const fs = require('fs');
const code = fs.readFileSync('tests/fixtures/state-param-shadow.tsx','utf8');
const ast = parseSync(code, { syntax: 'typescript', tsx: true });
function find(node, type) {
  if (!node || typeof node !== 'object') return [];
  const res = [];
  if (node.type === type) res.push(node);
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) res.push(...v.flatMap(x => find(x, type)));
    else if (v && typeof v === 'object') res.push(...find(v, type));
  }
  return res;
}
const fns = find(ast, 'FunctionExpression').concat(find(ast, 'ArrowFunctionExpression'), find(ast, 'FunctionDeclaration'));
console.log(JSON.stringify(fns.map(f => ({type:f.type, params:f.params, identifier:f.identifier?.value})), null, 2));

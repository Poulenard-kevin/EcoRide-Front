// scan-keys.js
// Usage: npm i @babel/parser @babel/traverse chalk && node scan-keys.js
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

const root = process.cwd();
const exts = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx'];

function walk(dir) {
  const res = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === 'node_modules' || name.startsWith('.git')) continue;
    const stat = fs.statSync(p);
    if (stat.isDirectory()) res.push(...walk(p));
    else if (stat.isFile() && exts.includes(path.extname(name))) res.push(p);
  }
  return res;
}

function parseFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx', 'typescript', 'classProperties'] });
  } catch (e) {
    // fallback: try script mode
    try { ast = parser.parse(src, { sourceType: 'unambiguous', plugins: ['jsx', 'typescript'] }); }
    catch (err) { return null; }
  }
  const found = { localStorageKeys: new Set(), stringLiterals: new Set(), propNames: new Set() };

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      // localStorage.getItem / setItem
      if (callee && callee.type === 'MemberExpression' && callee.object && callee.property) {
        const obj = callee.object.name || (callee.object.type === 'MemberExpression' && callee.object.property && callee.object.property.name);
        const prop = callee.property.name;
        if (obj === 'localStorage' && (prop === 'getItem' || prop === 'setItem')) {
          const arg = path.node.arguments[0];
          if (arg && arg.type === 'StringLiteral') found.localStorageKeys.add(arg.value);
        }
      }

      // fetch / axios payload likely: JSON.stringify({...}) or directly object arg
      // we'll collect string literals below
    },
    StringLiteral(path) {
      if (path.node.value && path.node.value.length <= 120) found.stringLiterals.add(path.node.value);
    },
    ObjectProperty(path) {
      // keys of object literal: { email: ..., 'password': ... }
      const key = path.node.key;
      if (key) {
        if (key.type === 'Identifier') found.propNames.add(key.name);
        else if (key.type === 'StringLiteral') found.propNames.add(key.value);
      }
    },
    MemberExpression(path) {
      // object.prop access -> prop name
      if (path.node.property && !path.node.computed && path.node.property.type === 'Identifier') {
        found.propNames.add(path.node.property.name);
      }
    }
  });

  return { file, found };
}

const files = walk(root);
const result = { localStorageKeys: new Set(), propNames: new Set(), stringLiterals: new Set() };

for (const f of files) {
  const parsed = parseFile(f);
  if (!parsed) continue;
  for (const v of parsed.found.localStorageKeys) result.localStorageKeys.add(v);
  for (const v of parsed.found.propNames) result.propNames.add(v);
  for (const v of parsed.found.stringLiterals) result.stringLiterals.add(v);
}

// Output
console.log(chalk.green('LocalStorage keys found:'));
console.log(Array.from(result.localStorageKeys).slice(0,200).join('\n') || '- none -');
console.log('\n' + chalk.green('Property names found (candidates):'));
console.log(Array.from(result.propNames).sort().join(', '));
console.log('\n' + chalk.green('String literals (sample):'));
console.log(Array.from(result.stringLiterals).slice(0,200).join('\n'));
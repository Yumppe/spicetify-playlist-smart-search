/**
 * Small, dependency-free bundle writer for this extension's intentionally
 * simple static ESM graph. It fails on unsupported import/export syntax rather
 * than shipping a silently incomplete extension. Browser output is one IIFE.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.resolve(root, 'src/index.js');
const modules = new Map();
const ordered = [];
const importRE = /^import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm;
const exportsRE = /^export\s+(?:(?:async\s+)?function|const|let|class)\s+([\w$]+)/gm;

function visit(file) {
  file = path.resolve(file);
  if (modules.has(file)) {
    if (modules.get(file)?.visiting) throw new Error(`Circular dependency: ${file}`);
    return;
  }
  if (!file.startsWith(path.join(root, 'src') + path.sep)) throw new Error(`Import outside src: ${file}`);
  const code = fs.readFileSync(file, 'utf8');
  const dependencies = [...code.matchAll(importRE)].map((match) => ({match:match[0], names:match[1], file:path.resolve(path.dirname(file), match[2])}));
  if (code.includes('import(') || /^import\s+(?!\{)/m.test(code)) throw new Error(`Unsupported import syntax: ${file}`);
  const exported = [...code.matchAll(exportsRE)].map((match) => match[1]);
  modules.set(file, {visiting:true, code, dependencies, exported});
  for (const dependency of dependencies) visit(dependency.file);
  modules.get(file).visiting = false;
  ordered.push(file);
}
visit(entry);
const names = ordered;
const ids = new Map(names.map((name,i)=>[name,i]));
let result = '// Playlist Smart Search 1.2 — generated from src/ by npm run build\n(() => {\n  "use strict";\n';
for (const file of ordered) {
  const module = modules.get(file);
  const id = ids.get(file);
  const dependencies = module.dependencies;
  let code = module.code.replace(importRE, (statement, names, target) => {
    const depId = ids.get(path.resolve(path.dirname(file), target));
    const importNames = names.replace(/\s+as\s+/g, ': ');
    return `const { ${importNames} } = __mod${depId};`;
  });
  code = code.replace(/^export\s+/gm,'');
  if (/^export\b|^import\b/m.test(code)) throw new Error(`Uncompiled module syntax in ${file}`);
  result += `  // ${path.relative(root,file)}\n  const __mod${id} = (() => {\n${code}\n    return { ${module.exported.join(', ')} };\n  })();\n`;
}
result += '})();\n';
const version = fs.readFileSync(path.join(root,'src/constants.js'),'utf8').match(/VERSION\s*=\s*'([^']+)'/)?.[1];
if (!version || !result.startsWith(`// Playlist Smart Search ${version}`)) throw new Error('Inconsistent public version');
new Function(result); // Confirm bundle is syntactically self-contained.
fs.writeFileSync(path.join(root,'smart-search.js'),result);
console.log(`Built smart-search.js (${Buffer.byteLength(result)} bytes; ${modules.size} modules; sha256 ${crypto.createHash('sha256').update(result).digest('hex')})`);

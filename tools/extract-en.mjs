// Reextrai o inventário das chaves de UI em inglês de uma instalação do DSH.
// Faz o parse estático dos objetos dos dicionários (sem `eval`), resolvendo
// `...spread` e propriedades abreviadas, então fontes já empacotadas são seguras.
//
//   node tools/extract-en.mjs <pasta-com-os-client.js> [locale/en.json] [inventory-report.json]
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = process.argv[2];
const outEn = process.argv[3] ?? join(repoRoot, 'locale/en.json');
const outReport = process.argv[4] ?? 'inventory-report.json';
if (!root) {
  console.error('uso: node tools/extract-en.mjs <pasta-com-os-client.js> [locale/en.json] [inventory-report.json]');
  process.exit(2);
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (name === 'client.js') acc.push(p);
  }
  return acc;
}

const skipString = (text, i) => {
  const quote = text[i];
  i++;
  while (i < text.length) {
    if (text[i] === '\\') i += 2;
    else if (text[i] === quote) return i + 1;
    else i++;
  }
  return i;
};

function matchBrace(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(text, i) - 1;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return { text: text.slice(start, i + 1), end: i };
    }
  }
  return null;
}

function readStringLiteral(text, i) {
  const quote = text[i];
  const end = skipString(text, i);
  const raw = text.slice(i + 1, end - 1);
  const interpolated = quote === '`' && raw.includes('${');
  return { value: interpolated ? null : raw.replace(/\\(['"`\\])/g, '$1'), end, interpolated };
}

/** Parse a `{...}` literal into ordered entries: {kind:'pair'|'spread'|'shorthand', key, value, name}. */
function parseObjectEntries(text, braceStart) {
  const obj = matchBrace(text, braceStart);
  if (!obj) return null;
  const entries = [];
  let i = braceStart + 1;
  const end = obj.end;
  while (i < end) {
    while (i < end && /[\s,]/.test(text[i])) i++;
    if (i >= end) break;
    if (text.startsWith('...', i)) {
      const m = /^\.\.\.\s*([A-Za-z_$][\w$]*)/.exec(text.slice(i));
      entries.push({ kind: 'spread', name: m ? m[1] : null });
      i += m ? m[0].length : 3;
    } else {
      let key = null;
      if (text[i] === '"' || text[i] === "'") {
        const s = readStringLiteral(text, i);
        key = s.value;
        i = s.end;
      } else {
        const m = /^([A-Za-z_$][\w$]*)/.exec(text.slice(i));
        if (!m) {
          i++;
          continue;
        }
        key = m[1];
        i += m[0].length;
      }
      while (i < end && /\s/.test(text[i])) i++;
      if (text[i] === ':') {
        i++;
        while (i < end && /\s/.test(text[i])) i++;
        if (text[i] === '{') {
          const nested = matchBrace(text, i);
          entries.push({ kind: 'pair', key, value: null, nested: true });
          i = nested ? nested.end + 1 : i + 1;
        } else if (text[i] === '"' || text[i] === "'" || text[i] === '`') {
          const s = readStringLiteral(text, i);
          entries.push({ kind: 'pair', key, value: s.value, interpolated: s.interpolated });
          i = s.end;
        } else {
          // non-literal value expression: consume to the next top-level , or }
          let depth = 0;
          const start = i;
          while (i < end) {
            const c = text[i];
            if (c === '"' || c === "'" || c === '`') {
              i = skipString(text, i);
              continue;
            }
            if ('([{'.includes(c)) depth++;
            else if (')]}'.includes(c)) {
              if (depth === 0) break;
              depth--;
            } else if (c === ',' && depth === 0) break;
            i++;
          }
          entries.push({ kind: 'pair', key, value: null, expr: text.slice(start, i).trim() });
        }
      } else {
        entries.push({ kind: 'shorthand', name: key });
      }
    }
  }
  return entries;
}

function resolveIdentifier(text, name, seen = new Set()) {
  if (seen.has(name)) return null;
  seen.add(name);
  const decl = new RegExp(`(?:const|let|var)\\s+${name.replace(/\$/g, '\\$')}\\s*=\\s*(\\{)`);
  const d = decl.exec(text);
  if (!d) return null;
  const entries = parseObjectEntries(text, d.index + d[0].length - 1);
  if (!entries) return null;
  const map = new Map();
  for (const e of entries) {
    if (e.kind === 'pair' && typeof e.value === 'string') map.set(e.key, e.value);
    else if (e.kind === 'spread' && e.name) {
      const inner = resolveIdentifier(text, e.name, seen);
      if (inner) for (const [k, v] of inner) if (!map.has(k)) map.set(k, v);
    } else if (e.kind === 'shorthand') {
      const inner = resolveIdentifier(text, e.name, new Set(seen));
      if (inner) for (const [k, v] of inner) if (!map.has(k)) map.set(k, v);
    }
  }
  return map;
}

const enAll = new Map();
const report = [];
const files = walk(root);
let registrations = 0;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const pkg = file.split(/[\\/]/).slice(-3)[0];
  const constants = new Map();
  for (const [, name, value] of text.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*"([^"]*)"/g)) constants.set(name, value);

  const re = /locale\.register\(\s*([A-Za-z_$][\w$]*|"[^"]*"|'[^']*')\s*,\s*(\{)/g;
  let m;
  while ((m = re.exec(text))) {
    const nsRaw = m[1];
    const ns = nsRaw.startsWith('"') || nsRaw.startsWith("'") ? nsRaw.slice(1, -1) : constants.get(nsRaw);
    const entries = parseObjectEntries(text, m.index + m[0].length - 1);
    registrations++;
    if (!entries) {
      report.push({ file, pkg, ns: ns ?? nsRaw, reason: 'register object not parsed' });
      continue;
    }
    for (const e of entries) {
      const key = e.kind === 'pair' ? e.key : e.kind === 'shorthand' ? e.name : null;
      if (!key || !/^(en|zh)/i.test(key)) continue;
      const map = resolveIdentifier(text, key);
      if (!map || map.size === 0) {
        report.push({ file, pkg, ns, key, reason: 'dictionary not resolved' });
        continue;
      }
      if (!/^en/i.test(key)) continue;
      const target = enAll.get(ns) ?? new Map();
      for (const [k, v] of map) if (!target.has(k)) target.set(k, v);
      enAll.set(ns, target);
    }
  }
}

const out = {};
for (const [ns, map] of [...enAll.entries()].sort()) out[ns] = Object.fromEntries(map);
const totalKeys = Object.values(out).reduce((n, o) => n + Object.keys(o).length, 0);
const unique = new Set(Object.values(out).flatMap((o) => Object.values(o)));
writeFileSync(outEn, JSON.stringify(out, null, 2));
writeFileSync(outReport, JSON.stringify(report, null, 2));
console.log(`bundles scanned: ${files.length}`);
console.log(`registrations: ${registrations}`);
console.log(`namespaces: ${Object.keys(out).length}, keys: ${totalKeys}, unique strings: ${unique.size}`);
console.log(`unresolved entries: ${report.length}`);
for (const r of report) console.log(`  ${r.pkg} | ${r.ns} | ${r.key ?? ''} | ${r.reason}`);

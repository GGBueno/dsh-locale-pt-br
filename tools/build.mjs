// Gera o client.js (metade Client do plugin) a partir de locale/en.json e
// locale/pt-BR.json, valida marcadores e escreve o relatório coverage.json.
//
//   node tools/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const en = JSON.parse(readFileSync(join(root, 'locale/en.json'), 'utf8'));
const pt = JSON.parse(readFileSync(join(root, 'locale/pt-BR.json'), 'utf8'));

const PACKAGE_NAME = 'dsh-locale-pt-br';
const LOCALE_ID = 'pt-BR';
const LOCALE_LABEL = 'Português (Brasil)';

const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const problems = [];

const enNamespaces = Object.keys(en).sort();
const ptNamespaces = Object.keys(pt).sort();
for (const ns of enNamespaces) if (!ptNamespaces.includes(ns)) problems.push(`namespace ausente no pt-BR: ${ns}`);
for (const ns of ptNamespaces) if (!enNamespaces.includes(ns)) problems.push(`namespace extra no pt-BR: ${ns}`);

const dicts = {};
let total = 0;
let translated = 0;
let identical = 0;
const incomplete = [];

for (const ns of enNamespaces) {
  dicts[ns] = {};
  for (const [key, source] of Object.entries(en[ns])) {
    total++;
    const target = pt[ns]?.[key];
    // Uma origem vazia é um valor legítimo (prefixo/separador inexistente).
    if (source === '' ) {
      dicts[ns][key] = '';
      continue;
    }
    if (typeof target !== 'string' || target === '') {
      problems.push(`tradução ausente: ${ns}/${key}`);
      dicts[ns][key] = source;
      continue;
    }
    if (placeholders(source).join('|') !== placeholders(target).join('|')) {
      problems.push(`marcadores divergentes: ${ns}/${key} (${source} -> ${target})`);
      dicts[ns][key] = source;
      continue;
    }
    dicts[ns][key] = target;
    if (target === source) identical++;
    else translated++;
    if (target === source && /[A-Za-z]{3,}/.test(source)) incomplete.push(`${ns}/${key}`);
  }
}

// O bundle sai em ASCII puro: todo caractere não-ASCII vira escape \uXXXX.
// Assim a acentuação não depende de nenhuma camada de entrega respeitar UTF-8 —
// se algum intermediário decodificar os bytes como Latin-1, a string em memória
// continua correta.
const asciiSafe = (text) => text.replace(/[^\x20-\x7E]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
const body = asciiSafe(JSON.stringify(dicts));
const client = `// ${PACKAGE_NAME} - metade Client: registra o idioma pt-BR e seus dicionarios
// no servico nativo de locale do DeepSeek Harness.
// Arquivo gerado por tools/build.mjs; edite locale/pt-BR.json, nao este arquivo.
// ASCII puro de proposito: a acentuacao viaja como escape \\uXXXX, entao nao
// depende de nenhuma camada intermediaria respeitar UTF-8.
window.__ModuleLoader__.load({
  id: "${PACKAGE_NAME}",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var LOCALE_ID = "${LOCALE_ID}";
    var LOCALE_LABEL = "${asciiSafe(LOCALE_LABEL)}";

    /** Dicionarios por namespace; chave ausente cai no ingles pela cadeia de fallback. */
    var DICTS = ${body};

    function apply(ctx) {
      ctx.effect(() => {
        var disposers = [
          ctx.locale.addLanguage({ id: LOCALE_ID, label: LOCALE_LABEL, fallback: "en" })
        ];
        for (var ns of Object.keys(DICTS)) {
          disposers.push(ctx.locale.register(ns, LOCALE_ID, DICTS[ns]));
        }
        return () => {
          for (var dispose of disposers) dispose();
        };
      }, "${PACKAGE_NAME}: dictionaries");
    }

    exports.apply = apply;
    exports.inject = ["locale"];
    return module.exports;
  },
});
`;

const nonAsciiBytes = [...client].filter((char) => char.charCodeAt(0) > 0x7f).length;
if (nonAsciiBytes > 0) problems.push(`o bundle contém ${nonAsciiBytes} caractere(s) não-ASCII`);

writeFileSync(join(root, 'client.js'), client);
writeFileSync(
  join(root, 'coverage.json'),
  JSON.stringify(
    {
      package: PACKAGE_NAME,
      locale: LOCALE_ID,
      namespaces: enNamespaces.length,
      keys: total,
      translatedKeys: translated,
      identicalToEnglish: identical,
      translatedPercent: Number(((translated / total) * 100).toFixed(2)),
      problems: problems.length,
      problemList: problems.slice(0, 200),
      identicalKeyList: incomplete.slice(0, 500),
      asciiOnly: nonAsciiBytes === 0,
    },
    null,
    2,
  ),
);

console.log(`namespaces: ${enNamespaces.length}`);
console.log(`chaves: ${total}`);
console.log(`traduzidas: ${translated} (${((translated / total) * 100).toFixed(2)}%)`);
console.log(`iguais ao inglês (siglas/marcas/tokens): ${identical}`);
console.log(`problemas: ${problems.length}`);
for (const p of problems.slice(0, 20)) console.log(`  - ${p}`);
console.log(`client.js: ${client.length} bytes | ASCII puro: ${nonAsciiBytes === 0}`);
if (problems.length > 0) process.exitCode = 1;

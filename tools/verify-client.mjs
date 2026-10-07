// Verifica o client.js gerado sem instalar nada: formato do módulo,
// contrato do plugin (inject/apply) e as chamadas ao serviço de locale.
//
//   node tools/verify-client.mjs [caminho-do-client.js]
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const clientPath = process.argv[2] ?? join(root, 'client.js');
const packageName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name;

// Regras copiadas do dsh-client-locale 0.2.0-rc.2
const LOCALE_ID_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;

let captured = null;
globalThis.window = { __ModuleLoader__: { load: (def) => { captured = def; } } };
await import(pathToFileURL(clientPath).href);

const problems = [];
if (!captured) problems.push('o arquivo não chamou window.__ModuleLoader__.load');
if (captured && captured.id !== packageName) problems.push(`id do módulo (${captured.id}) difere do nome do pacote (${packageName})`);
if (captured && typeof captured.factory !== 'function') problems.push('factory ausente');

const mod = captured.factory((name) => { throw new Error(`require inesperado: ${name}`); });
if (!Array.isArray(mod.inject) || !mod.inject.includes('locale')) problems.push('inject deve conter "locale"');
if (typeof mod.apply !== 'function') problems.push('apply ausente');

const languages = [];
const registrations = [];
const effects = [];
const ctx = {
  effect(fn, label) {
    effects.push(label);
    const disposers = fn();
    return () => { if (typeof disposers === 'function') disposers(); };
  },
  locale: {
    addLanguage(input) {
      languages.push(input);
      return () => {};
    },
    register(ns, locale, dict) {
      registrations.push({ ns, locale, keys: Object.keys(dict).length, dict });
      return () => {};
    },
  },
};

mod.apply(ctx);

if (languages.length !== 1) problems.push(`addLanguage chamado ${languages.length}x (esperado 1)`);
const language = languages[0] ?? {};
if (!LOCALE_ID_PATTERN.test(language.id ?? '')) problems.push(`id de idioma inválido para o DSH: ${language.id}`);
if (language.id !== 'pt-BR') problems.push(`id inesperado: ${language.id}`);
if (!language.label || language.label.trim() === '') problems.push('label vazio');
if (language.fallback !== 'en') problems.push(`fallback deve ser "en", veio ${language.fallback}`);

const namespaces = new Set(registrations.map((r) => r.ns));
if (registrations.length !== namespaces.size) problems.push('namespace registrado mais de uma vez');
for (const r of registrations) {
  if (r.locale !== 'pt-BR') problems.push(`registro com locale errada em ${r.ns}: ${r.locale}`);
  if (r.keys === 0) problems.push(`dicionário vazio em ${r.ns}`);
}

let totalKeys = 0;
const emptyValues = [];
for (const r of registrations) {
  for (const [k, v] of Object.entries(r.dict)) {
    totalKeys++;
    if (typeof v !== 'string') emptyValues.push(`${r.ns}/${k} não é string`);
  }
}

const effectLabels = effects.filter(Boolean);
console.log(`módulo: ${captured.id}`);
console.log(`inject: ${JSON.stringify(mod.inject)}`);
console.log(`idioma: ${language.id} | label: ${language.label} | fallback: ${language.fallback}`);
console.log(`namespaces registrados: ${namespaces.size}`);
console.log(`chaves registradas: ${totalKeys}`);
console.log(`efeitos com rótulo: ${effectLabels.length}`);
console.log(`valores não-string: ${emptyValues.length}`);
console.log(problems.length === 0 ? 'VERIFICAÇÃO OK' : `PROBLEMAS:\n- ${problems.join('\n- ')}`);
if (problems.length > 0) process.exitCode = 1;

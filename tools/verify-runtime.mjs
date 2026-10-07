// Verificação de integração contra o LocaleRuntime REAL do DSH.
//
// Sobe o serviço de locale lendo o bundle do próprio app (de dentro do app.asar),
// injeta o nosso pacote e confere: catálogo, ativação, traduções e fallback.
// Não instala nada e não escreve no perfil.
//
// Uso (Windows, com o dsh instalado):
//   $env:ELECTRON_RUN_AS_NODE=1
//   & "<instalação>\DeepSeek Harness.exe" --expose-internals tools/verify-runtime.mjs [caminho-do-app.asar]
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASAR = process.argv[2] ?? process.env.DSH_ASAR
  ?? 'C:/Users/giova/AppData/Local/Programs/DeepSeek Harness/resources/app.asar';
const asarUrl = (p) => pathToFileURL(`${ASAR}/${p}`).href;

// Stub permissivo para os módulos de UI, que só são usados ao renderizar.
const magic = new Proxy(function () {}, {
  get: (_t, prop) => (prop === 'then' || prop === 'toJSON' || typeof prop === 'symbol' ? undefined : magic),
  apply: () => magic,
  construct: () => magic,
});

let captured = null;
globalThis.window = { __ModuleLoader__: { load: (def) => { captured = def; } } };
globalThis.document = undefined;

await import(asarUrl('dsh/node_modules/@deepseek-ai/dsh-client-locale/lib/client.js'));
const localeModule = captured.factory(() => magic);

let localeService = null;
await localeModule.apply({
  configForms: { get: () => undefined },
  provide: (name, service) => { if (name === 'locale') localeService = service; },
  slots: { installLocale() {}, inject() {}, register() {} },
  effect: (fn) => { fn(); },
  on() {},
  emit() {},
  fiber: { uid: 'verify-runtime' },
});
if (!localeService) throw new Error('o serviço de locale não foi provido pelo bundle do DSH');

captured = null;
await import(pathToFileURL(join(repoRoot, 'client.js')).href);
captured.factory(() => { throw new Error('o nosso cliente não importa módulos'); })
  .apply({ effect: (fn) => { fn(); }, locale: localeService });

const problems = [];
const snapshot = localeService.getSnapshot();
const pt = snapshot.locales.find((l) => l.id === 'pt-BR');
if (!pt) problems.push('pt-BR não está no catálogo de idiomas');
else if (pt.label !== 'Português (Brasil)') problems.push(`label inesperado: ${pt.label}`);

localeService.setLocale('pt-BR');
if (localeService.getSnapshot().active !== 'pt-BR') problems.push('setLocale não ativou pt-BR');

const cases = [
  ['common', 'copy', 'Copiar'],
  ['common', 'save', 'Salvar'],
  ['common', 'search', 'Pesquisar'],
  ['common', 'cancel', 'Cancelar'],
  ['settings.locale', 'language.title', 'Idioma'],
];
for (const [ns, key, expected] of cases) {
  const got = localeService.translate(ns, key);
  if (got !== expected) problems.push(`${ns}/${key}: ${JSON.stringify(got)} (esperado ${JSON.stringify(expected)})`);
}

// Uma amostra de outros namespaces deve voltar em português (não a própria chave).
const sample = [
  ['chat', 'message.stepProcess.read'],
  ['sidebarDocumentPreview', 'reload'],
  ['sidebarPdf', 'rendering'],
];
for (const [ns, key] of sample) {
  const got = localeService.translate(ns, key);
  if (got === key || got === '') problems.push(`${ns}/${key} não resolveu (${JSON.stringify(got)})`);
}

const missing = 'chave.que.nao.existe';
if (localeService.translate('chat', missing) !== missing) problems.push('chave inexistente não caiu para o próprio identificador');

localeService.setLocale('en');
if (localeService.getSnapshot().active !== 'en') problems.push('não foi possível voltar para en');

console.log(`catálogo: ${snapshot.locales.map((l) => `${l.id} (${l.label})`).join(', ')}`);
console.log(`namespaces registrados pelo pacote: ${localeService.dicts.size}`);
console.log(problems.length === 0 ? 'INTEGRAÇÃO OK' : `PROBLEMAS:\n- ${problems.join('\n- ')}`);
if (problems.length > 0) process.exitCode = 1;

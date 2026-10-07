// Baixa o módulo exatamente como o navegador o recebe e confere o conteúdo,
// incluindo se a acentuação depende de UTF-8 ou viaja como escape \uXXXX.
//
//   node tools/probe-served.mjs [origem] [nome-do-pacote]
//   node tools/probe-served.mjs http://127.0.0.1:19387 dsh-locale-pt-br
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const origin = process.argv[2] ?? 'http://127.0.0.1:19387';
const packageName = process.argv[3] ?? 'dsh-locale-pt-br';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const clientPath = join(root, 'client.js');

// O Host identifica a revisão do artefato por um hash sha1 dos metadados do arquivo.
const framedHash = (domain, parts) => {
  const hash = createHash('sha1').update(domain).update('\0');
  for (const part of parts) hash.update(`${String(Buffer.byteLength(part))}:`).update(part);
  return hash.digest('hex').slice(0, 12);
};
const baseline = statSync(clientPath);
const rev = framedHash('plugin-artifact', [
  String(baseline.mtimeMs),
  String(baseline.ctimeMs),
  String(baseline.size),
]);

const url = `${origin}/plugins/??${packageName}/client.js&rev=${rev}`;
console.log(`arquivo local: ${statSync(clientPath).size} bytes`);
console.log(`rev calculado: ${rev}`);
console.log(`url: ${url}`);

const response = await fetch(url);
const bytes = Buffer.from(await response.arrayBuffer());
const text = bytes.toString('utf8');
const local = readFileSync(clientPath, 'utf8');

console.log(`status: ${response.status} | content-type: ${response.headers.get('content-type')} | ${bytes.length} bytes`);
if (response.status !== 200) {
  console.log('O Host não reconhece essa revisão: ele ainda não re-escaneou o pacote.');
  process.exitCode = 1;
} else {
  const nonAscii = [...bytes].filter((byte) => byte > 0x7f).length;
  console.log(`bytes não-ASCII servidos: ${nonAscii} (nosso arquivo: ${[...Buffer.from(local)].filter((b) => b > 0x7f).length})`);
  console.log(`servido contém o arquivo local: ${text.startsWith(local)}`);
  const marker = text.match(/bonusNoticeTitle\\?":\\?"([^"\\]*)/);
  console.log(`valor de settings.account/bonusNoticeTitle no fio: ${JSON.stringify(marker?.[1])}`);
}

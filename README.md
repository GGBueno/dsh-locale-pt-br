# dsh-locale-pt-br

Pacote de idioma **português do Brasil** para a interface web do [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh).

Instalado, ele adiciona **Português (Brasil)** à linha nativa de idioma do DSH — **Configurações → Geral → Idioma** — ao lado de 中文 e English. A escolha é persistida pelo próprio DSH (`locale.preference`), sobrevive a reinícios e trocas de navegador, e `<html lang>` passa a `pt-BR`.

| | |
|---|---|
| Idioma | `pt-BR` — Português (Brasil) |
| Namespaces | 57 |
| Chaves | 2.592 |
| Traduzidas | 2.410 |
| Iguais ao inglês de propósito (siglas, marcas, teclas, tokens) | 181 |
| Desenvolvido contra | dsh `0.2.0-rc.2` |
| Licença | MIT |

Relatório completo de cobertura: [`coverage.json`](./coverage.json).

## Instalação

```sh
# quando publicado no npm
dsh plugin --profile <perfil> add dsh-locale-pt-br

# direto do GitHub
dsh plugin --profile <perfil> add github:GGBueno/dsh-locale-pt-br

# de uma cópia local
dsh plugin --profile <perfil> add /caminho/para/dsh-locale-pt-br
```

Depois, recarregue a página com `Ctrl+Shift+R` e escolha **Português (Brasil)** em **Configurações → Geral → Idioma**. Se a opção não aparecer, reinicie o DSH para recompor o perfil.

Para remover: página **Plugins** do DSH, ou `dsh plugin --profile <perfil> remove dsh-locale-pt-br`.

## Como funciona

O DSH tem suporte nativo a pacotes de idioma pelo pacote `@deepseek-ai/dsh-client-locale`. Esta é uma metade Client pura: ela pede o serviço `locale` e, num único `ctx.effect`,

```js
ctx.locale.addLanguage({ id: 'pt-BR', label: 'Português (Brasil)', fallback: 'en' });
ctx.locale.register(namespace, 'pt-BR', dicionario);   // para cada namespace
```

A UI de seleção, a persistência, `<html lang>`, o evento `locale/change` e o fallback por chave pertencem ao DSH — o pacote não desenha nada e não faz monkey-patch. Chave sem tradução cai na cadeia `pt-BR` → `en`, então nada fica em branco.

**Sem `peerDependencies` de propósito:** o gerenciador de plugins do DSH recusa a instalação quando um peer `@deepseek-ai/dsh-*` não satisfaz a versão em execução (foi o que aconteceu com pacotes de idioma que declaram `^0.1.x`). Este pacote não declara peer nenhum para continuar instalável em versões futuras; o preço é que chaves novas ou renomeadas aparecem em inglês até o dicionário ser atualizado.

**O bundle é ASCII puro:** todo caractere não-ASCII sai como escape `\uXXXX` (`"Bônus creditado"` vira `"B\u00f4nus creditado"`). A acentuação deixa de depender de qualquer camada intermediária respeitar UTF-8 — se algum elo decodificar os bytes como Latin-1, a string em memória continua correta. `tools/build.mjs` falha se o arquivo gerado tiver qualquer byte acima de `0x7F`.

## Estrutura

| Caminho | Papel |
|---|---|
| `client.js` | Metade Client: catálogo de idioma + dicionários. **Gerado** — não edite à mão |
| `index.js` | Metade Host, intencionalmente vazia |
| `cordis.patch.yml` | Insere a linha do plugin na composição do perfil |
| `locale/pt-BR.json` | Fonte da verdade das traduções (`namespace → chave → texto`) |
| `locale/en.json` | Inventário das chaves em inglês da versão-alvo do DSH |
| `tools/build.mjs` | Valida e gera `client.js` + `coverage.json` |
| `tools/verify-client.mjs` | Confere o contrato do módulo sem instalar |
| `tools/verify-runtime.mjs` | Integração contra o `LocaleRuntime` real do DSH (catálogo, ativação, traduções, fallback) |
| `tools/probe-served.mjs` | Baixa o módulo como o navegador o recebe e confere o conteúdo no fio |
| `tools/extract-en.mjs` | Reextrai o inventário em inglês de uma instalação do DSH |

## Atualizar para uma nova versão do DSH

```sh
# 1. extraia os bundles de cliente da instalação e reconstrua o inventário
node tools/extract-en.mjs <pasta-com-os-client.js> locale/en.json inventory-report.json

# 2. o diff entre o en.json novo e o antigo mostra chaves novas/renomeadas;
#    traduza-as em locale/pt-BR.json

# 3. valide e gere
node tools/build.mjs
node tools/verify-client.mjs
```

Para conferir a integração contra o serviço de locale real do DSH (lê o bundle de dentro do `app.asar`, não instala nada):

```powershell
$env:ELECTRON_RUN_AS_NODE=1
& "<instalação>\DeepSeek Harness.exe" --expose-internals tools/verify-runtime.mjs
```

Os passos 1 e 3 não precisam de DSH em execução; o `verify-client.mjs` carrega o `client.js` num `window.__ModuleLoader__` simulado, e o `verify-runtime.mjs` sobe o `LocaleRuntime` de verdade em Node (Electron em modo Node).

## Licença e atribuição

Código deste pacote: **MIT** (veja [`LICENSE`](./LICENSE)).

Os textos originais em inglês de `locale/en.json` são a cópia de interface do projeto DeepSeek Harness e pertencem aos seus autores; eles estão aqui apenas como referência de tradução e são distribuídos sob a licença do projeto de origem.

---

## English summary

Brazilian Portuguese language pack for the DeepSeek Harness web GUI. It registers the `pt-BR` locale through dsh's native language-pack API (`ctx.locale.addLanguage` + `ctx.locale.register`) and ships dictionaries for all 57 built-in namespaces (2,592 keys, 2,410 translated). Untranslated keys fall back to English per key. Install with `dsh plugin add`, then pick **Português (Brasil)** in Settings → General → Language. MIT licensed; see [`coverage.json`](./coverage.json) for the coverage report.

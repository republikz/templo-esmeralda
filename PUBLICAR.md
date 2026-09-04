# Publicar esta atualizacao

## GitHub + Cloudflare Pages

1. Exporte um backup do site publicado e guarde fora do repositorio.
2. Suba o CONTEUDO da pasta `github` do pacote na raiz do repositorio conectado ao projeto atual. Preserve as subpastas. Nao suba o ZIP como um unico arquivo.
3. Antes do commit que dispara o deploy, confira no Cloudflare: comando `npm run build`, diretorio de saida `dist`, raiz do projeto igual a raiz do repositorio.
4. Mantenha os mesmos secrets e destinos existentes: `SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STATE_TABLE`, `SUPABASE_STATE_ROW_ID` e `SUPABASE_STORAGE_BUCKET`. Nao crie outra campanha nem execute importacao/seed/schema para esta atualizacao.
5. Remova do repositorio arquivos antigos de campanha, recuperacao, backups, screenshots e servidor local. A nova versao publica apenas dist, mas arquivos antigos podem continuar no historico do Git e em deployments anteriores.
6. Depois do deploy, verifique login de Mestre e Jogador, imagens, contagens da campanha e um salvamento controlado. Confira o resultado em outra aba antes de continuar a sessao.

## O que o pacote inclui

- app.js, index.html, styles.css, table-data.json, catalog-worker.js e icone.
- assets/ com fontes e mapas originais.
- functions/ com autenticacao, persistencia e API.
- package.json, package-lock.json, _headers, .gitignore, scripts/ e documentos.
- worker.js, mantido para a checagem de sintaxe existente; o backend Pages usa functions/.

## Nunca subir

campaign-state*.json, recovered-*, backups, screenshots/, .dev.vars, .wrangler/, node_modules/, serve.ps1 ou arquivos de PINs. O pacote NAO inclui dados da campanha.

Nao arraste apenas dist para o painel de upload do Cloudflare: esse fluxo nao compila Pages Functions. Use o repositorio Git conectado. Nao altere o diretorio de saida para a raiz.

## Verificacao local

`npm ci`, `npm run check`, `npm run build`, `npm run audit:public`.
Testes de navegador precisam dos browsers Playwright e de uma copia local do estado. Os testes interceptam chamadas de API; nao validam os secrets e a conectividade do Supabase de producao.

## Alteracoes de robustez desta revisao

- Objetivos do Inicio: limite visual de tres linhas e Ver mais/Ver menos.
- Cache volumoso no IndexedDB; cache antigo mantido como fallback de leitura.
- Gravacao Supabase condicional pela revisao: conflito nao sobrescreve um estado mais recente.
- Fila de retry preserva o payload mais novo; sincronizacao nao troca o estado durante arraste da linha do tempo.
- Assets com hash usam cache longo; mapas/fontes sem hash revalidam em prazo curto.

Nao foi realizado deploy, alteracao de secrets ou escrita no Supabase durante a revisao. Validacao em Safari/iPhone e Chrome Android fisicos e o smoke test do deployment real continuam necessarios.

Documentacao oficial: https://developers.cloudflare.com/pages/get-started/git-integration/ e https://developers.cloudflare.com/pages/get-started/direct-upload/

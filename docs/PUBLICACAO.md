# Versão online para testes

O site pode ser publicado como arquivos estáticos no GitHub Pages. Não precisa de um servidor Node em produção, chaves ou acesso ao TSE.

## Gerar a versão estática

```sh
npm ci --no-audit --no-fund
npm run build:pages
```

O comando gera `out/` com HTML, CSS, JavaScript e o catálogo público. O prefixo padrão é `/VotoSobCustodia`, correspondente a este repositório. Outro prefixo pode ser informado por `PAGES_BASE_PATH` antes do build. O arquivo `.nojekyll` é criado para permitir o diretório `_next` no Pages.

Os ZIPs de 1,1 GB em `data/official/` não são incluídos no site estático. As informações usadas pela interface estão incorporadas ao build e em `out/data/catalog.json`; nenhuma consulta ao TSE é feita na navegação.

## Ativar no GitHub

Depois que o conteúdo de `out/` for enviado à branch `gh-pages`:

1. Abra as configurações do repositório e a seção **Pages**.
2. Em **Build and deployment**, selecione **Deploy from a branch**.
3. Escolha a branch **gh-pages**, pasta **/ (root)**, e salve.
4. Aguarde o processamento do GitHub Pages e use o endereço informado na própria página.

Endereço esperado após ativação: `https://thiagoalz.github.io/VotoSobCustodia/`. A existência da branch não comprova que o Pages foi ativado nem que a publicação terminou. A versão foi preparada para habilitação pelo usuário porque o ambiente recusou acesso à API `api.github.com`.

## Atualizações

Esta publicação inicial usa uma branch de arquivos gerados. Alterar apenas `main` não atualiza automaticamente o site: gere novamente `out/` e atualize `gh-pages` para publicar a nova versão. Não coloque os arquivos brutos do TSE nessa branch.

Para executar em desenvolvimento, continue usando `npm run dev`. Para o servidor Next local, execute `npm run build` antes de `npm run start`; `next start` não é usado para servir o export estático.

## Testes da versão exportada

O Playwright aceita `TEST_BASE_URL` para exercitar os mesmos filtros, seleção de UF, navegação móvel e ausência de chamadas externas em um servidor estático já iniciado. O endereço deve terminar em `/VotoSobCustodia/` para conferir o prefixo de publicação. Sem essa variável, `npm run test:e2e` usa o servidor Next normal.

Os resultados eleitorais por categoria continuam em revisão. A versão online permite testar a interface e mostra explicitamente essa limitação.

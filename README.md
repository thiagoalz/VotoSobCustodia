# Voto Sob Custódia

Site independente sobre o direito ao voto e os resultados **nas seções eleitorais identificadas em presídios e unidades socioeducativas**, com as duas categorias separadas.

## Estado atual

- Primeira interface funcional: explicação jurídica, mapa selecionável por UF, busca, filtros, resultados, método e perguntas frequentes.
- Piloto escolhido: **Distrito Federal, 2022, primeiro e segundo turnos separados**.
- Importação de CSV/ZIP do TSE preparada e testada com dados sintéticos, restritos aos testes.
- **18 arquivos oficiais do TSE baixados e preservados**, totalizando 1.108.104.032 bytes: votação nacional para presidente em 2018, 2022 e 2026, cadastros de locais, transferências e metadados. Veja [o manifesto](data/official/manifest.json).
- O cruzamento preliminar do DF/2022 encontrou votação nas 16 seções/turnos de oito locais classificados pelo TSE como `Preso provisório`. Isso ainda não separa presídios de unidades socioeducativas nem equivale a conferência com boletins de urna.
- O catálogo público lista as fontes adquiridas, mas não publica resultados ainda. O mapa atual é um seletor por UF; pontos das unidades e classificação por categoria ainda dependem de revisão.
- O bloqueio inicial de rede foi resolvido após a publicação do ambiente. A síntese jurídica ainda requer conferência da legislação e das regras aplicáveis a cada eleição. Nenhuma configuração do ambiente foi alterada durante a aquisição.

## Executar

Requisitos: Node.js 24 (usado: 24.19.0), npm 11 e Python 3.12 ou posterior. A importação usa apenas a biblioteca padrão do Python. Use o checkout existente; não é necessário criar worktree.

```sh
cd /workspace/VotoSobCustodia
npm ci --no-audit --no-fund
npm run dev
```

Para produção local:

```sh
npm run build
npm run start
```

O processo usa a porta 3000. A aplicação não precisa de chaves, banco de dados ou serviço externo para iniciar. Não depende de fontes web nem de tiles remotos para desenhar o mapa por UF.

## Verificar

Para publicar uma versão online de testes, consulte [docs/PUBLICACAO.md](docs/PUBLICACAO.md). O build estático é `npm run build:pages`; ele usa arquivos locais e não inclui os ZIPs brutos no site.

```sh
npm run typecheck
npm run test:data
npm run build
npm run test:e2e
```

Os testes de navegador usam o Chromium instalado em `/usr/bin/chromium`. Para outra instalação, defina `CHROMIUM_PATH` para o executável local. O Playwright inicia o servidor de produção caso não exista um processo na porta 3000; não requer baixar um navegador neste ambiente.

No ambiente gerenciado, operações de rede, subprocessos e abertura de portas podem precisar da execução autorizada fora do sandbox. Não remova os proxies nem desabilite a verificação TLS. A aprovação de execução não substitui a lista de destinos permitidos.

## Pesquisar e importar dados

**Os dados serão preservados dentro do repositório.** Originais e manifesto ficam em `data/official/`; cadastros revisados ficam em `data/reviewed/`; o catálogo derivado fica em `public/data/catalog.json`. Essas três localizações são versionáveis. A pasta `data/raw/` é apenas temporária.

O site, o build e a inicialização usam somente os arquivos locais, sem consultar o TSE. A rede é usada exclusivamente na aquisição manual das fontes. O arquivador reutiliza uma cópia existente sem fazer HTTP e exige `--refresh` para buscar uma atualização; conserva a versão anterior. Consulte [data/official/README.md](data/official/README.md).

```sh
python -m pipeline.snapshot fetch --help
python -m pipeline.snapshot verify
python -m pipeline.inventory
```

Os originais já foram baixados. **Não é necessário consultar novamente o catálogo ou baixar arquivos para usar a base existente.** `snapshot verify` confere os hashes; `inventory` reproduz o inventário e o cruzamento preliminar somente com os arquivos locais. O relatório fica em [data/reviewed/acquisition-report.json](data/reviewed/acquisition-report.json). Uma futura atualização é opcional e explícita.

1. Siga o roteiro em [docs/PILOTO.md](docs/PILOTO.md).
2. Somente para procurar novos recursos ou atualizar a base, repita a descoberta no catálogo:

   ```sh
   python -m pipeline.discover_sources --year 2022
   ```

   O relatório temporário fica em `data/raw/discovery.json` (ignorado pelo Git). Os catálogos originais usados na aquisição estão arquivados em `data/official/`. Saída 2 indica falha em alguma consulta; uma resposta sem registros não prova inexistência de dados.

3. Após identificar a URL real da fonte, use `python -m pipeline.snapshot fetch` para arquivar o original em `data/official/`. Preserve também as evidências do vínculo unidade/seção. Preencha uma cópia do cabeçalho em `data/templates/sections.csv`, após conferir os vínculos nas fontes oficiais. Salve-a em `data/reviewed/`.
4. Execute o importador indicando o arquivo, o cadastro, a URL **real** do arquivo oficial, a data **real** de obtenção, o ano, a UF e a saída. Consulte todos os argumentos com:

   ```sh
   python -m pipeline.import_votes --help
   ```

   A saída é um catálogo JSON. Primeiro gere um arquivo intermediário em `data/reviewed/` e confira os totais. Só depois substitua `public/data/catalog.json` e reconstrua o site. A versão inicial do importador gera um catálogo para um ano/UF; **não mescla catálogos de anos ou estados diferentes**. A consolidação nacional é uma próxima etapa.

O site incorpora o catálogo no build: alterar o JSON exige novo build ou reinício do desenvolvimento. Não publicar fixtures dos testes como dados reais.

## Preservação dos originais grandes

Os ZIPs estão configurados em `.gitattributes` para **Git LFS**, que foi inicializado localmente. Os maiores arquivos nacionais excedem o limite do Git comum. Para um futuro clone após o envio do projeto e dos objetos LFS, use `git lfs install` e `git lfs pull`. Verifique com `python -m pipeline.snapshot verify` antes de processar: um ponteiro LFS sem o conteúdo real falhará na conferência. **Nenhum commit, push ou upload LFS foi feito nesta aquisição.** Os originais estão no checkout local.

## Regras do cadastro e do cálculo

- Chave: ano, turno, UF, código TSE do município, zona e seção. Não confundir código municipal TSE com código IBGE.
- Uma seção/turno não pode pertencer a duas unidades no cadastro. Se houver locais compartilhados ou seções agregadas, é necessária uma resolução documentada antes de importar.
- Cada vínculo requer referência HTTPS oficial, data de revisão e identificação de quem revisou. Validar um domínio não verifica o conteúdo da fonte: a conferência é humana.
- Categorias aceitas: `presidio` e `socioeducativa`. Não inferir pelo nome da unidade.
- Coordenadas podem estar ausentes; nunca preencher com centroide municipal como se fosse a localização exata.
- Arquivo de votos esperado: CSV separado por ponto e vírgula, codificação Latin-1 por padrão, também aceito dentro de ZIP. Ajuste a codificação por argumento quando necessário.
- O importador seleciona `DS_CARGO=Presidente`; códigos 95/96 são tratados como brancos/nulos. Outros códigos especiais inesperados são recusados para investigação.
- Duplicidades, contagens negativas, referências incompletas e seções cadastradas sem votação correspondente interrompem a importação.
- O SHA-256 preserva a rastreabilidade do arquivo recebido; não equivale a uma assinatura ou autenticação da origem.
- Percentuais usam votos válidos do recorte. Abstenção e comparecimento não são calculados sem dados oficiais compatíveis de eleitorado.
- Votos de servidores e mesários podem estar incluídos. Os dados não permitem atribuir votos individuais a pessoas presas.
- A cobertura permanece parcial até demonstração documentada do universo esperado.

## Tecnologia e atribuições

Next.js, React e TypeScript; processamento em Python; dados agregados locais. Banco de dados, serviço de mapas externos e análise de todos os arquivos nacionais não são necessários para este piloto.

O mapa utiliza `@svg-maps/brazil`, de Victor Cazanave, baseado em MapSVG, sob **CC BY 4.0**. Atribuição completa e adaptações em [docs/ATRIBUICOES.md](docs/ATRIBUICOES.md).

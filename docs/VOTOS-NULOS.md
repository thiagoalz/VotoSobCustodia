# Estudo nacional dos números registrados em votos nulos

Página: `/votos-nulos/`. Cargo: **presidente**; eleição: **2026, segundo turno** (ID TSE 6258). Abrange todas as seções com RDV oficial disponível nas **27 UFs**, incluindo o DF. Não se limita às instituições de custódia. Exterior (ZZ) não é uma UF e não integra este recorte.

A tabela mostra o número digitado, sua quantidade total de votos nulos no Brasil e uma coluna com a quantidade de cada uma das 27 UFs, de AC a TO. A ordem inicial é decrescente pelo total. Todas as 29 colunas permitem ordenar em ambos os sentidos, pelos cabeçalhos ou pelo seletor **Ordenar por**. A coluna do número permanece visível durante a rolagem horizontal; no desktop, o total também fica fixo. Busca e CSV preservam zeros à esquerda, como `00`.

Na consolidação desta versão: **497.897 RDVs**, **27 UFs**, **98 números**, **2.717.579 nulos com digitação** e **609 sem digitação**. A soma de **2.718.188 nulos** confere com a apuração oficial por UF. Os pacotes locais contendo apenas RDVs ocupam 216.904.272 bytes, aproximadamente 217 MB.

## Fontes e aquisição

- [Arquivos transmitidos para totalização — TSE 2026](https://dadosabertos.tse.jus.br/dataset/resultados-2026-arquivos-transmitidos-para-totalizacao).
- [Especificação técnica dos arquivos BU, RDV e assinatura digital — TSE 2026](https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/formato-arquivos-de-bu-rdv-e-assinatura-digital).
- [Resultados de 2026](https://dadosabertos.tse.jus.br/dataset/resultados-2026): o arquivo nacional de votação por seção para presidente, já preservado no projeto, é a referência independente das contagens de nulos por UF.

Os pacotes completos das 27 UFs somam aproximadamente 124 GB e contêm também logs, boletins e assinaturas. `pipeline.rdv_download` lê os índices ZIP e baixa **todos os membros `*-rdv.dat` e `*-rdvred.dat`** por HTTP Range/multipart. Preserva os bytes originais de cada membro em um ZIP local por UF, sem trazer os demais arquivos dos pacotes. Os novos ZIPs locais não são apresentados como cópias integrais dos pacotes de 124 GB.

Os originais e metadados ficam em `data/official/rdv-2026/`, que está explicitamente ignorado pelo Git. Não há envio de RDVs ou logs brutos ao repositório público nem inclusão deles no site. As páginas usam apenas os agregados em `public/data/null-votes.json` e o CSV correspondente.

A aquisição registra a URL, o tamanho e ETag do pacote de origem, os offsets/tamanhos/CRC32 dos membros, o número esperado e obtido por UF e SHA-256 dos arquivos locais. Cada membro é descompactado e conferido pelo CRC32 original antes de ser preservado. Respostas HTTP 200 no lugar de 206, multipart incompleto, tamanhos divergentes ou CRC incorreto são recusados. `If-Match` impede misturar versões de um mesmo pacote durante a aquisição.

Uma execução posterior reutiliza os pacotes locais íntegros sem acessar a rede. Se um download foi interrompido de forma controlada, os membros já gravados são reutilizados. O comando de publicação também opera inteiramente offline.

## Leitura e cálculo

O processador usa `spec/rdv.asn1` de **2026**, BER e `asn1tools`, com validação das restrições do esquema. Exige fase `oficial`, confere a identificação da seção com o nome do arquivo e seleciona exclusivamente `cargoConstitucional=presidente` na eleição 6258. Governador e outros cargos presentes nos arquivos não entram na contagem.

O esquema define `VotoDigitado` como a digitação feita pelo eleitor e o campo `digitacao` como “Número como digitado pelo eleitor”. A contagem inclui registros cujo `tipoVoto` começa por `nulo` e que possuem digitação válida. Cada registro incrementa o número uma vez. `digitacao` permanece string; não se transforma `00` em `0`.

Tipos sem digitação, como `nuloAposSuspensao`, são contabilizados separadamente e não recebem um número inventado. O código `96` dos CSVs agregados é apenas a classificação de nulo; o número `96` nesta tabela é contado somente quando aparece efetivamente em `digitacao`.

Uma seção/eleição é contada uma vez. RDVs repetidos com a mesma distribuição são deduplicados; versões conflitantes da mesma seção interrompem a consolidação daquela UF para revisão. RDVs sem cargo presidencial são registrados na cobertura e não se confundem com seções de zero nulos.

A soma dos registros com e sem digitação é confrontada, por UF, com os votos `NR_VOTAVEL=96` do CSV nacional de votação por seção já arquivado. Divergências impedem publicar uma consolidação como validada. O JSON público registra a conferência e a versão SHA-256 da referência.

Cada UF apresenta a **quantidade absoluta** daquele número, sem ponderação pelo eleitorado. O total nacional é a soma das 27 contagens estaduais, e a soma das linhas é conferida com o total de nulos com digitação. Uma UF processada sem registros de um número recebe **zero**; uma UF ainda não processada recebe **—** na interface e célula vazia no CSV. Valores indisponíveis ficam no fim em ambos os sentidos de ordenação. Empates numéricos são resolvidos pelo número digitado para manter a ordem determinística.

O CSV tem as mesmas 29 colunas, incluindo todas as UFs. O download pela página respeita a busca e a ordenação exibidas; o CSV estático publicado fica na ordem inicial por total nacional.

## Executar

A aquisição é um comando manual explícito. Os comandos seguintes leem apenas arquivos locais:

```sh
python -m pipeline.rdv_download --workers 6
python -m venv /tmp/voto-nulos-venv
/tmp/voto-nulos-venv/bin/pip install -r requirements-rdv.txt
python -m pipeline.verify_null_votes
/tmp/voto-nulos-venv/bin/python -m pipeline.publish_null_votes --workers 3
```

Para processar UFs à medida que seus downloads terminam, o publicador aceita `--watch`. O modo sem `--watch` termina com erro se não houver 27 UFs concluídas. Os resultados por UF são armazenados localmente com as versões do pacote e do esquema; análises repetidas reutilizam o cache validado.

Depois de gerar os agregados, `npm run build:pages` produz o site estático. A navegação, a busca, a ordenação e o download do CSV não consultam o TSE. O GitHub Pages recebe somente código e dados agregados.

## Limites

O universo observado é o dos RDVs oficiais disponibilizados pelo TSE para as 27 UFs; o catálogo de origem informa que considera arquivos em situação “Totalizado”. A página diferencia cobertura em processamento de consolidação concluída e apresenta contagens por UF.

Os dados não identificam eleitores nem a ordem cronológica em que votaram. A interpretação é de números registrados em votos confirmados, não de tentativas de digitação ou correções. Não se atribuem os nulos a candidaturas nem se deduz a intenção de quem votou.

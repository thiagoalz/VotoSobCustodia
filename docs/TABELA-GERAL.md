# Tabela de instituições e municípios

Endereço: `/tabela/`, acessível por **Tabela geral** no menu do site. O prefixo `/VotoSobCustodia` é aplicado automaticamente no GitHub Pages.

Cada linha corresponde a um local de votação cadastrado na eleição e turno escolhidos. A tabela inclui todos os locais do catálogo nesse recorte, mesmo quando o resultado da instituição estiver indisponível. Não é um inventário completo de todos os estabelecimentos físicos do país.

## Campos e interação

- Instituição, município, UF e tipo. Tipos sem confirmação documental continuam **A classificar**.
- Para cada candidato: votos e percentual dos válidos na instituição; votos e percentual dos válidos no município inteiro.
- Totais da instituição: válidos, brancos, nulos e total. Totais municipais: os mesmos campos e votos anulados e apurados em separado (código oficial 97), incluídos no total municipal.
- Filtros de eleição, turno, UF e tipo, além de busca por instituição/município sem distinção de acentos. Eleições e turnos não são somados.
- Todos os cabeçalhos ordenam numericamente ou alfabeticamente; um segundo clique inverte a ordem. O seletor **Ordenar por** permite acessar qualquer coluna sem deslocar a tabela horizontalmente. Valores indisponíveis ficam no fim em ambos os sentidos; empates usam nome/UF/identificador para uma ordem determinística.
- O CSV contém todas as linhas filtradas e respeita a ordenação. Usa UTF-8 com BOM, ponto e vírgula e percentuais com duas casas decimais. Inclui eleição, turno e código municipal TSE para rastreabilidade.

## Origem e cálculos

`app/tabela/page.tsx` prepara os dados no build, a partir de `public/data/catalog.json` e `public/data/municipalities.json`. `lib/institution-table.ts` associa local e município por ano, turno, UF e código municipal TSE. Resultados municipais só são aceitos se URL e SHA-256 da fonte coincidirem com a versão arquivada no catálogo principal. Não há chamadas de rede para obter dados ao abrir a página, filtrar, ordenar ou exportar.

O município inclui todas as suas seções, inclusive as da própria instituição. Mais de uma instituição do mesmo município repete os totais municipais em cada linha; essa repetição não deve ser somada como se representasse municípios distintos. No DF, o código eleitoral de BRASÍLIA não é uma região administrativa.

O percentual é `100 × votos do candidato / votos válidos`, calculado separadamente para cada recorte e ordenado antes do arredondamento de exibição. Ausência de linha de um candidato em um resultado disponível representa zero votos, como no catálogo publicado. Resultado inteiro ausente e denominador válido igual a zero produzem `—` (célula vazia no CSV), nunca um percentual fictício.

As fontes e hashes estão disponíveis no rodapé da página. Permanecem as limitações do catálogo: cobertura parcial, subtipo em revisão, exclusões documentadas de seções sem vínculo validado e possibilidade de votos de servidores/mesários no agregado. Consulte [DADOS-PUBLICADOS.md](DADOS-PUBLICADOS.md) e [COMPARACAO-MUNICIPAL.md](COMPARACAO-MUNICIPAL.md).

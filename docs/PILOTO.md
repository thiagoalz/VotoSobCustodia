# Piloto: Distrito Federal, eleição presidencial de 2022

## Objetivo

Demonstrar, com fontes oficiais, a ligação entre unidades, seções e votos para presidente em cada turno. Presídios e unidades socioeducativas serão pesquisados em paralelo e apresentados separadamente. O recorte foi escolhido pelo tamanho; não existe ainda comprovação de cobertura suficiente no DF.

## Situação observada

O acesso ao catálogo e ao CDN do TSE funcionou após a publicação do ambiente. Foram baixados 18 arquivos oficiais, incluindo os dados presidenciais nacionais de 2018, 2022 e 2026. O inventário, com hashes, está em `data/official/manifest.json`. Nenhuma configuração do ambiente foi reaplicada nesta etapa.

O cruzamento local do cadastro de locais de votação e da votação presidencial de 2022 encontrou **16 seções/turnos correspondentes a oito locais no DF**, classificados pelo TSE como `Preso provisório`. Todos os 16 possuem votação correspondente. Isso é um cruzamento preliminar: a categoria oficial é mais ampla que a divisão presídio/socioeducativa pretendida pelo projeto. A classificação de cada unidade e a conferência independente dos resultados ainda estão pendentes.

O relatório reproduzível está em `data/reviewed/acquisition-report.json`; gere novamente com `python -m pipeline.inventory`, sem acessar a internet. Foram percorridos 5.380.736 registros no arquivo presidencial de 2022. Há coordenadas sentinela `-1/-1` e contagens de eleitorado zero no cadastro especial; esses campos não serão usados para criar pontos ou calcular comparecimento sem investigação.

Os destinos oficiais previstos para pesquisa são:

- `dadosabertos.tse.jus.br`: catálogo.
- `cdn.tse.jus.br`: possíveis arquivos de dados — os caminhos devem ser encontrados no catálogo.
- `www.tse.jus.br`: resoluções, orientações e sistemas oficiais.
- `www.tre-df.jus.br`: seções especiais e regras locais de 2022.
- `www.planalto.gov.br`: Constituição e legislação.

O TSE respondeu às consultas e aos downloads. A pesquisa de documentos específicos do TRE-DF ainda não forneceu uma evidência suficiente para classificar separadamente as oito unidades. Os downloads não atestam revisão da Constituição ou das resoluções.

## Roteiro de pesquisa após a liberação

1. Consultar o catálogo do TSE para localizar votação por seção de 2022. Conferir dicionário, codificação, versão, cobertura e tamanho dos arquivos. Preferir DF se disponível, sem pressupor que um arquivo rotulado DF contenha votos para presidente: confirmar `DS_CARGO` e, se necessário, localizar o arquivo nacional adequado.
2. Localizar cadastro histórico de locais/seções e arquivos de eleitorado. Conferir se há classificação oficial de estabelecimento e vínculo com seção. Um cadastro atual não demonstra a situação de 2022.
3. No TRE-DF, procurar atos, listas ou notícias oficiais sobre votação de presos provisórios e adolescentes internados em 2022. A notícia pode orientar a busca; uma lista/ato que identifique as seções deve fundamentar o vínculo.
4. Registrar unidade, categoria, município, zona, seção e turno com a referência específica. Se a fonte valer para os dois turnos, registrar isso explicitamente. Não presumir continuidade entre turnos ou eleições.
5. Investigar seções agregadas e locais compartilhados. Não duplicar votos de uma seção entre duas unidades ou categorias. Se não houver resolução segura, manter a seção fora do total e registrar a lacuna.
6. Quando os registros não forem suficientes, solicitar ao TRE-DF via canal oficial/LAI a relação das seções instaladas em estabelecimentos prisionais e socioeducativos, por turno, com mudanças e agregações. Nenhuma solicitação externa foi enviada.
7. Obter endereços históricos e coordenadas de fontes identificadas. Distinguir localização confirmada e aproximada. O primeiro mapa é por UF; pontos exatos virão após essa revisão.
8. Conferir a Constituição e as resoluções aplicáveis a 2022. Para anos distintos, revisar regras de instalação, transferência e participação de servidores/mesários de forma independente.

## Critérios para declarar o piloto validado

- Há pelo menos um vínculo confirmado por categoria, se a documentação comprovar que ambas tiveram seções no recorte. Caso contrário, a categoria ausente fica explicitamente sem cobertura confirmada.
- Todas as seções incluídas encontram correspondência em votação presidencial, por turno.
- A amostra de conferência inclui todos os resultados do piloto quando viável; em volume maior, documenta a seleção, incluindo ambas as categorias e ambos os turnos disponíveis.
- Totais por candidato, válidos, brancos e nulos são reconciliados com registros oficiais/boletins da amostra.
- Arquivos originais, URLs, datas de obtenção e hashes ficam registrados.
- O universo esperado e a cobertura efetiva são documentados. Importação bem-sucedida sozinha não demonstra completude.
- A versão publicada identifica lacunas e não descreve os votos agregados como escolha exclusiva de pessoas presas.

## Próximas entregas

1. Concluir o piloto real e revisar a síntese jurídica.
2. Adicionar consolidação incremental com isolamento por ano, UF e turno, preservando a proveniência.
3. Incluir geolocalização das unidades e navegação no mapa com coordenadas revisadas.
4. Expandir estados e anos a partir dos originais locais já adquiridos. Os primeiros registros dos arquivos presidenciais de 2018 e 2026 foram conferidos quanto a cargo e ano; o processamento completo e a consolidação desses resultados continuam pendentes.

Fontes de dados efetivamente adquiridas: arquivos e metadados de [TSE Dados Abertos](https://dadosabertos.tse.jus.br/), com URLs específicas no manifesto local. [TRE-DF](https://www.tre-df.jus.br/) e [Constituição](https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm) continuam como referências de pesquisa para a revisão documental/jurídica.

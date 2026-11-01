# Unidade e município inteiro

Ao selecionar uma unidade, o painel compara a votação das suas seções com a votação do **município inteiro, incluindo a própria unidade**. Não é calculado um município com os votos da unidade subtraídos.

## Origem e processamento

- Os municípios são identificados por **UF + código eleitoral municipal do TSE**, encontrado nas seções da unidade. Não usar código IBGE ou apenas o nome da cidade.
- O publicador percorre o arquivo **nacional completo de votação por seção para presidente** em cada ano. O filtro é o município de interesse; não é aplicado o filtro de custódia.
- Todas as zonas e seções desse município presentes no arquivo entram no total, incluindo locais convencionais, outras unidades e a unidade selecionada.
- Ano, turno e cargo são separados. Duplicidade de seção/votável interrompe a geração; o contador usa uma máscara de candidatos por seção para limitar o uso de memória.
- Branco (95), nulo (96) e **anulado e apurado em separado (97)** ficam separados dos votos nominais. A definição de 97 está no `leiame.pdf` que acompanha os ZIPs oficiais. Anulados em separado não entram no denominador dos percentuais válidos nem aparecem como candidatos.
- Cada arquivo original tem seu hash verificado. As fontes precisam corresponder às versões usadas pelo catálogo de unidades. A interface também confere a correspondência dos hashes antes de oferecer os resultados municipais daquele ano.

O relatório `data/reviewed/municipalities-report.json` registra o processamento, as fontes e as verificações de inclusão. Nesta versão há **976 resultados de município/turno**: 292 de 2018, 304 de 2022 e 380 de 2026. As 1.363 apurações de unidade/turno publicadas tiveram suas seções verificadas como presentes no arquivo municipal; os subtotais das unidades, inclusive por candidato, não podem exceder os totais municipais.

## Reprodução local

```sh
python -m pipeline.publish_municipalities
```

São usados somente os arquivos já arquivados. A saída é `public/data/municipalities.json`, sem downloads. Se houver atualização dos originais ou do catálogo, gere primeiro o catálogo de unidades e depois os resultados municipais, usando as mesmas versões das fontes. Reconstrua o site após atualizar os JSONs.

## Apresentação

- A comparação aparece após selecionar uma unidade. Agregações de diversas unidades não recebem um município arbitrário como comparação.
- Ao trocar turno, a seleção da unidade é mantida se ela existir no cadastro daquele turno. Ao mudar eleição ou filtros que alterem a lista, a seleção é limpa para impedir comparação com dados de outra unidade/ano.
- Cada candidato tem votos e percentual nos dois recortes. As duas barras usam escala fixa de 0% a 100%.
- Percentual da unidade = votos do candidato na unidade ÷ válidos da unidade. O município usa seu próprio denominador.
- Diferença em pontos percentuais = percentual da unidade − percentual municipal. Não é uma variação percentual relativa. Percentuais inexistentes por denominador zero e dados indisponíveis são explícitos.
- Um candidato sem linha em um recorte com resultado tem zero votos naquele recorte; a ausência do resultado inteiro não é convertida em zero.
- O download JSON inclui o resultado municipal inteiro, o escopo da comparação, os percentuais, as diferenças e a fonte utilizada.
- No DF, a identificação municipal do cadastro é Brasília, que não representa uma região administrativa específica.

## Exemplo conferido: Papuda / Brasília, 2022, segundo turno

Unidade: 105 votos válidos; Bolsonaro 57 e Lula 48. Município inteiro: 1.770.626 votos válidos; Bolsonaro 1.041.331 e Lula 729.295. O total municipal permanece inteiro, incluindo a unidade.

Bolsonaro: 54,29% na unidade e 58,81% no município, diferença de −4,53 p.p. Lula: 45,71% e 41,19%, diferença de +4,53 p.p. O município tem 29.663 votos brancos, 38.203 nulos e 1.838.492 votos ao todo, distribuídos em 6.748 seções presentes no arquivo.

Os valores foram calculados dos originais locais do TSE e passaram por verificações aritméticas e de inclusão. Não houve uma nova conferência independente com outro conjunto oficial de totalização. A comparação não identifica votos individuais; a unidade continua sujeita às limitações do recorte de custódia já publicadas.

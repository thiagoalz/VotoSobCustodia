# Votos publicados a partir dos originais locais

O catálogo público agora contém resultados reais, não somente uma lista de fontes. O processamento usa exclusivamente os ZIPs já preservados no repositório, depois de conferir seus hashes.

## Recorte e limites

São selecionados os registros históricos com **CD_TIPO_LOCAL=3**, denominados pelo TSE como **Preso provisório**. Esse campo inclui locais que atendem pessoas presas e adolescentes internados; ele não separa os dois subtipos. Por isso, a classificação inicial é **A classificar**. Não foi inferido subtipo pelo nome do estabelecimento.

O site mantém filtros distintos para presídios e unidades socioeducativas, que receberão apenas classificações sustentadas por fonte oficial e revisão explícita. Enquanto isso, **Todas** e **A classificar** mostram os votos do recorte oficial, com essa limitação visível.

Não se trata de todos os presídios do Brasil, de uma contagem de pessoas presas votantes ou de votos individuais. Mesários e servidores podem participar dessas seções. A correspondência entre os dois arquivos oficiais foi verificada; não houve conferência independente de todos os boletins de urna.

## Cobertura desta versão

| Eleição | Turno | Seções principais no cadastro | Seções com correspondência | Válidos | Brancos | Nulos |
|---|---:|---:|---:|---:|---:|---:|
| 2018 | 1 | 223 | 220 | 8.557 | 410 | 364 |
| 2018 | 2 | 223 | 219 | 7.909 | 179 | 480 |
| 2022 | 1 | 222 | 221 | 11.024 | 167 | 172 |
| 2022 | 2 | 222 | 221 | 9.999 | 128 | 196 |
| 2026 | 1 | 243 | 243 | 11.190 | 259 | 230 |
| 2026 | 2 | 243 | 243 | 10.556 | 142 | 160 |

O catálogo tem **686 registros de local por eleição** e **1.363 resultados de local/turno**. Um estabelecimento pode aparecer em mais de um ano; 686 não é uma contagem de estabelecimentos físicos distintos.

Seções agregadas não são remapeadas automaticamente. Vínculos conflitantes e seções sem votação correspondente ficam fora dos totais. As lacunas, suas chaves e razões estão em `data/reviewed/publication-report.json`; ausência não vira zero votos. Os denominadores acima se referem às seções principais elegíveis no cadastro, não a um universo nacional comprovadamente completo.

## Reproduzir sem rede

```sh
python -m pipeline.publish_catalog
```

O comando verifica os arquivos locais e gera `public/data/catalog.json` e `data/reviewed/publication-report.json`. A leitura de um ZIP que contenha BRASIL e UFs usa somente o arquivo nacional, evitando duplicação.

Uma classificação revisada pode ser fornecida por `--classifications ARQUIVO.json`. O arquivo deve conter uma lista de registros com `unit_id`, `kind` (`presidio` ou `socioeducativa`), `evidence_url` oficial HTTPS, `reviewed_at` e `reviewer`. O ID inclui ano, UF, município, zona e local para evitar presumir continuidade de uma unidade entre eleições.

## Verificação do piloto

O resultado do DF/2022 foi comparado ao recorte por seção preservado no inventário anterior, por número de votável e por turno. No segundo turno: oito seções, Lula 251, Bolsonaro 131, brancos 3, nulos 4 — 389 votos ao todo. Essa é uma conferência de extrações locais dos arquivos oficiais, não uma auditoria independente dos boletins.

Os testes de navegador exigem esses votos na interface e no download, verificam os seis recortes de ano/turno e impedem regressão para um catálogo sem resultados. Também exercitam filtros e a ausência de chamadas externas durante a navegação.

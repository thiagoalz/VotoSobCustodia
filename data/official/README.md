# Cópias locais das fontes oficiais

**Aquisição realizada em 1º de novembro de 2026:** 18 arquivos originais do TSE, somando 1.108.104.032 bytes. Os três arquivos nacionais de votação para presidente são de 2018, 2022 e 2026. Também foram preservados catálogos, locais de votação e recursos auxiliares disponíveis. Consulte `manifest.json` para URLs, datas, tamanhos e hashes de cada original.

Esta pasta e seus arquivos finais **não são ignorados pelo Git**. Somente downloads temporários em `.downloads/` são ignorados. Os cadastros revisados em `data/reviewed/` também são versionáveis.

## Fluxo

1. Localizar a URL exata do arquivo oficial no catálogo/documento da fonte. Não presumir nomes de ZIP nem usar espelhos não conferidos.
2. Fazer uma aquisição explícita com `python -m pipeline.snapshot fetch`; os argumentos são descritos em `python -m pipeline.snapshot fetch --help`.
3. O comando guarda o original em `data/official/ANO/ID/SHA256.EXT`, com URL, data, tamanho e hash em `manifest.json`.
4. Repetir o mesmo comando reutiliza a cópia local, confere o hash e **não faz nenhuma requisição HTTP**. Corrupção local interrompe a operação; não é corrigida silenciosamente pela rede.
5. Usar `--refresh` somente quando se decidir atualizar. A versão anterior continua no repositório. O checksum fornecido via `--sha256`, quando houver um publicado pela fonte, é obrigatório para aquele download; nunca alterá-lo para contornar uma divergência.
6. Usar `python -m pipeline.snapshot verify` para conferir todos os arquivos sem rede. Um manifesto vazio retorna erro, pois não comprova que os dados estão disponíveis.
7. Processar as cópias locais com o importador. Publicar o JSON derivado em `public/data/catalog.json` após a revisão. Guardar os vínculos revisados e as evidências locais junto das fontes para reprodução futura.

O site, seu build e sua inicialização não executam descoberta nem download. Links de referência são apenas links; os visitantes não precisam consultar o TSE para usar os dados publicados pelo site.

## Arquivos grandes

O limite padrão de download é 90 MiB. Nesta aquisição, os ZIPs grandes foram identificados e Git LFS foi preparado localmente antes de aumentar o limite. `.gitattributes` registra `data/official/**/*.zip` como LFS. Os originais estão materializados no checkout; não houve commit, push nem upload dos objetos LFS. A disponibilidade para futuros clones exige o envio posterior de ambos, metadados Git e objetos LFS. Não basta enviar ponteiros vazios.

## Conferência local

`python -m pipeline.snapshot verify` confere os 18 arquivos sem rede. `python -m pipeline.inventory` reproduz o inventário e o cruzamento preliminar DF/2022, gravando `data/reviewed/acquisition-report.json`. O script evita ler duas vezes a mesma base quando um ZIP reúne arquivos por UF e um arquivo nacional `BRASIL`.

O arquivo de votação DF/2022 contém cargos estaduais: o piloto presidencial usa `votacao-secao-presidente-br`, não `votacao-secao-df`. Em 2026, o recurso de transferências por seção é diferente do recurso de transferências agregadas e foi arquivado com um ID próprio. Nenhum dos recursos é sobrescrito pelo outro.

Um hash calculado após o download identifica o conteúdo, mas não é autenticação independente da origem. A aquisição usa HTTPS oficial, proxies e verificação TLS normais. O arquivamento não comprova a classificação de uma seção nem a completude dos resultados.

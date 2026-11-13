# Saúde no Território

Painel estático, em português do Brasil, para explorar doenças e condições classificadas pela CID-10 nos municípios brasileiros e investigar fatores do território ligados a elas. Usa apenas dados públicos oficiais, agregados por scripts reproduzíveis. Funciona no GitHub Pages, sem etapa de build e sem servidor próprio.

O painel ajuda a investigar. Ele não afirma a causa das doenças de um município: mostra o que foi registrado, como isso se compara com a população e com outros lugares, o que a literatura descreve e o que falta medir.

## O que está integrado

| Tipo | Fonte | Períodos | Nível |
| --- | --- | --- | --- |
| Óbitos por causa básica | SIM / Ministério da Saúde (microdados abertos) | 2023 e 2024 completos; 2025 (jan–set) e 2026 (jan–ago) parciais | município, UF e Brasil; qualquer capítulo, grupo ou categoria CID-10; subcategoria por UF; sexo e idade por capítulo |
| Internações no SUS | SIH/SUS, via TabNet | 2023 a 2025 completos; 2026 (jan–set) | município; capítulo CID-10 |
| Notificações de dengue | SINAN, via TabNet | 2023 a 2026 | município |
| População | IBGE: Censo 2022 e estimativas 2024–2026 | — | município, UF, Brasil; sexo e idade só no Censo |
| Indicadores do território (25) | Censo 2022, PIB dos Municípios 2021, CNES 2025, INPE Queimadas 2025 | — | município |
| Catálogo CID-10 | DATASUS, versão 2008, com suplemento documentado | — | 22 capítulos, 275 grupos, 2.051 categorias, 12.488 subcategorias |

Não integrado, com o motivo registrado em `dados/indicadores/dicionario.json` (campo `lacunas`) e mostrado na interface: clima e desastres (o portal do INMET recusou a conexão na coleta), imunização (o tabulador público termina em 2022, no sistema antigo), índices entomológicos, qualidade do ar medida e demais agravos do SINAN. Comportamento e nutrição ficaram fora do escopo.

## Áreas do site

A navegação é organizada por tarefa, em quatro entradas:

1. **Explorar** — entrada com uma única busca (município ou doença) e números do Brasil; análise municipal e mapa como duas formas de ver a mesma consulta.
   - *Análise municipal*: abas Panorama, Evolução, Fatores e melhorias e Principais causas. O panorama segue a ordem de um painel: no topo, a situação em uma frase e os números-chave (taxa, registros, estado, Brasil); no meio, a tendência por ano; na base, causas, fatores e, sob demanda, os números completos, o critério e a fonte.
   - *Mapa*: números do Brasil no topo, mapa dominante (legenda fora do território), maiores e menores taxas abaixo e a tabela completa só quando pedida.
   - *Fatores e melhorias*: síntese e números-chave, indicadores ligados à condição com detalhes em cada item, perfil completo e lacunas em expansões.
2. **Doenças** — busca primeiro; a hierarquia da CID-10 fica num painel secundário. A ficha mostra números do Brasil, evolução, riscos e prevenção e, sob demanda, dados por fonte, subcategorias e classificação.
3. **Comparar** — até 6 municípios ou estados: taxas na mesma escala, evolução por ano e, sob demanda, tabela, exportação e indicadores do território.
4. **Fontes e metodologia** — índice por assunto, resumos curtos e detalhes (fórmulas, cobertura, manifestos, referências) sob demanda.

A consulta ativa aparece numa linha compacta; o formulário abre só quando a pessoa pede (no celular, como folha inferior). A seleção (município, causa, evento, período, sexo, idade, aba) fica no endereço da página, que pode ser compartilhado.

## Executar localmente

```sh
python3 -m http.server 8000
```

Depois acesse <http://localhost:8000>. Abrir `index.html` direto do disco não funciona, porque o navegador bloqueia a leitura dos arquivos de dados.

## Publicar no GitHub Pages

Publique a raiz do repositório pelo branch `main`. O site usa `index.html`, `assets/` e `dados/` (exceto `dados/brutos/`, que não é versionada). O arquivo `.nojekyll` já está na raiz. A única dependência externa em tempo de execução é o Leaflet, carregado por CDN.

## Estrutura

```
index.html                    página única; as áreas são trocadas pelo endereço (#/mapa, #/municipio…)
assets/css/styles.css         estilos, responsivo e impressão
assets/js/config.js           caminhos, constantes, escala do mapa e seleção
assets/js/utils.js            utilidades, leitura com cache, estatística e exportação CSV
assets/js/dados.js            leitura dos arquivos agregados e consultas básicas
assets/js/calculos.js         taxas, comparação com referência, padronização, associação
assets/js/mapa.js             mapa Leaflet em dois níveis (estados e municípios por UF)
assets/js/painel.js           visão geral, mapa, município e comparação
assets/js/conteudo.js         catálogo CID, fatores e melhorias, fontes
assets/js/main.js             navegação, barra de seleção e inicialização
dados/referencia/             municípios (IBGE) e catálogo CID-10
dados/saude/                  sim/, sih/ e dengue/: eventos agregados e índice de cada fonte
dados/populacao/              denominadores
dados/indicadores/            tabela municipal, dicionário e situações de ausência
dados/conhecimento/base.json  relações doença–fator, ações e referências
dados/manifestos/             um manifesto por fonte e o índice usado pelo site
dados/relatorios/             validação, cobertura e pendências de junção
dados/geo/                    malhas do mapa
dados/brutos/                 downloads das fontes (não versionados)
scripts/                      preparação e validação (Python 3, só biblioteca padrão)
docs/                         dicionário de dados e relatório de validação
```

## Atualizar os dados

```sh
python3 scripts/atualizar_tudo.py            # reaproveita downloads existentes
python3 scripts/atualizar_tudo.py --refazer  # baixa tudo de novo
```

O comando executa, nesta ordem: `preparar_territorios.py`, `preparar_cid10.py`, `preparar_sim.py`, `preparar_ibge.py`, `preparar_tabnet.py`, `preparar_cnes_inpe.py`, `montar_indicadores.py`, `montar_conhecimento.py` e `validar.py --tabnet`. Cada script pode ser executado sozinho; todos param com mensagem clara se um campo obrigatório faltar ou um total não fechar, e os downloads interrompidos são retomados na execução seguinte. São cerca de 500 MB de downloads e uns 10 minutos.

Depois de atualizar, mude `DATA_VERSION` em `assets/js/config.js` e o sufixo `?v=` em `index.html`, para o navegador não misturar versões em cache. Para incluir um ano novo do SIM, acrescente-o à lista `ANOS` de `preparar_sim.py` e de `preparar_tabnet.py`.

A malha do mapa é gerada à parte e exige `shapely`:

```sh
uv run --with shapely scripts/gerar_geo.py dados/geo/municipios dados/geo
```

## Regras de cálculo

As fórmulas completas estão em **Fontes e metodologia**, no site, e em [docs/DADOS.md](docs/DADOS.md). Em resumo:

- Taxa = eventos ÷ população × 100.000. Sem denominador, a taxa não é calculada.
- Anos parciais não são anualizados nem comparados com anos completos sem aviso.
- A referência é a UF no mesmo período. O resultado é “acima” ou “abaixo” apenas quando o intervalo de 95% da razão observado/esperado (Poisson, aproximação de Byar) fica inteiro de um lado de 1.
- Padronização indireta por idade e sexo para óbitos por capítulo ou total, com a população do Censo 2022.
- Eventos de sistemas diferentes nunca são somados. Zero observado, dado indisponível e dado suprimido são tratados de forma diferente.
- Indicadores de estados ou capitais não são atribuídos a municípios.

## Limitações conhecidas

- 2025 e 2026 são prévias do SIM, com meses incompletos. Não se sabe pela API se 2023 e 2024 já são definitivos; o site informa a data de publicação de cada arquivo.
- Não há estimativa populacional para 2023; o painel usa o Censo 2022 e avisa.
- Internações existem só por capítulo; notificações, só de dengue. Não há dado de incidência.
- A comparação por idade não existe para grupos e categorias (só taxa bruta).
- A malha do mapa (geodata-br) não tem 7 municípios criados depois de 2009, entre eles Boa Esperança do Norte (MT). Eles aparecem em buscas e tabelas, mas não são desenhados. Ver `dados/relatorios/territorios.json`.
- Boa Esperança do Norte (MT) não tem Censo 2022 nem estimativa de 2024: fica sem taxa nesses anos.
- A base de conhecimento cobre 17 temas. Os demais códigos mostram apenas números, sem texto explicativo.
- Nomes de códigos da CID criados depois de 2008 são tradução livre do projeto, marcados como suplemento.

## Mudanças em relação à versão anterior

- O recorte de quatro grupos de doenças crônicas deu lugar a toda a CID-10.
- As proporções dentro do recorte deram lugar a taxas por população.
- Os registros individuais (`dados/estados/2026/*.csv`) e o carregamento de CSV foram removidos: o site publica só agregados. A auditoria desses arquivos, que traziam nomes no lugar de códigos de município, está em `dados/relatorios/legado_municipios.json`.
- O limiar de 20 óbitos do mapa foi trocado por uma regra baseada em eventos observados e esperados.

## Fontes

- [SIM — dados abertos do Ministério da Saúde](https://dadosabertos.saude.gov.br/dataset/sim)
- [TabNet / DATASUS](https://datasus.saude.gov.br/informacoes-de-saude-tabnet/) (SIH/SUS e SINAN)
- [SIDRA / IBGE](https://sidra.ibge.gov.br/) e [API de localidades](https://servicodados.ibge.gov.br/api/docs/localidades)
- [CNES — dados abertos](https://dadosabertos.saude.gov.br/dataset/cnes-cadastro-nacional-de-estabelecimentos-de-saude)
- [Programa Queimadas / INPE](https://terrabrasilis.dpi.inpe.br/queimadas/portal/)
- [CID-10 / DATASUS](http://www2.datasus.gov.br/cid10/V2008/cid10.htm)
- [GeoJSON de municípios — geodata-br](https://github.com/tbrugz/geodata-br)

Os endereços exatos de cada recurso, com versão, período, licença e limitações, estão em `dados/manifestos/`.

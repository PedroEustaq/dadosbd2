# Relatório de validação

Gerado em 2026-11-12 por `python3 scripts/validar.py --tabnet`. Resultado: **aprovado, sem falhas**.

## Verificações automáticas

- SIM 2023: 1,465,610 óbitos; 1,463,376 com município; arquivos por município, perfil, capítulo e UF com o mesmo total
- SIM 2024: 1,527,369 óbitos; 1,525,090 com município; arquivos por município, perfil, capítulo e UF com o mesmo total
- SIM 2025: 937,033 óbitos; 935,960 com município; arquivos por município, perfil, capítulo e UF com o mesmo total
- SIM 2026: 912,010 óbitos; 910,979 com município; arquivos por município, perfil, capítulo e UF com o mesmo total
- SIH 2023: 13,214,566 internações; soma dos municípios igual ao total da fonte
- SIH 2024: 14,036,998 internações; soma dos municípios igual ao total da fonte
- SIH 2025: 14,512,171 internações; soma dos municípios igual ao total da fonte
- SIH 2026: 11,059,010 internações; soma dos municípios igual ao total da fonte
- Dengue 2023: 1,645,350 casos prováveis; 10 sem município identificado
- Dengue 2024: 6,564,921 casos prováveis; 27 sem município identificado
- Dengue 2025: 1,643,215 casos prováveis; 11 sem município identificado
- Dengue 2026: 494,921 casos prováveis; 8 sem município identificado
- População: 5571 municípios; com algum ano sem valor: 1
- Indicadores: 25 colunas conferidas com o dicionário; percentuais dentro de 0–100

## Conferência independente com a fonte

TabNet SIM (obt10br.def), 2023, óbitos por residência, município × capítulo CID-10: **68.133 de 68.133 células iguais** (100%); total do tabulador 1.463.376, total do painel 1.463.376.
As internações e os casos de dengue vêm do próprio tabulador, e a soma dos municípios é conferida com a linha de total da fonte.

## Exemplos de cálculo conferíveis

| Local | Ano | CID | Óbitos | População | Taxa por 100 mil |
| --- | --- | --- | --- | --- | --- |
| São Paulo (3550308) | 2024 | I21 | 6425 | 11895578 | 54.01 |
| Campinas (3509502) | 2024 | I00–I99 | 2392 | 1185977 | 201.69 |

Municípios homônimos: “Bom Jesus” existe em 2201903 (PI), 2401701 (RN), 2502201 (PB), 4202537 (SC), 4302303 (RS); cada um tem código próprio e a busca mostra a UF.

## Casos-limite tratados

| Caso | Comportamento |
| --- | --- |
| Divisão por zero ou denominador ausente | `taxa()` devolve nulo; a interface mostra “—” e explica (ex.: Boa Esperança do Norte/MT em 2024) |
| Filtro de sexo ou idade | só para óbitos por capítulo ou total, com população do Censo 2022 do mesmo recorte; nos outros casos a taxa é recusada com explicação |
| Ano parcial | marcado em todas as telas; não anualizado; barras listradas na série |
| Códigos hierárquicos | grupo e capítulo somam as categorias do intervalo; a tabela de causas usa só os grupos mais específicos; subcategorias não são somadas ao total da categoria |
| Zero × ausência | zero registros recebe aviso de que não prova ausência; fonte que não cobre a combinação aparece como “dado indisponível” |
| Trocas rápidas de filtro | cada renderização tem um número; respostas antigas são descartadas (`renderToken`, `dadosToken`, `levelToken`) |
| Falha de carregamento | mensagem com “Tentar novamente”; o cache não guarda requisições que falharam |

## Pendências de junção

- Malha do mapa: 5564 feições para 5571 municípios. Sem geometria: Mojuí dos Campos/PA, Nazária/PI, Pescaria Brava/SC, Balneário Rincão/SC, Pinto Bandeira/RS, Paraíso das Águas/MS, Boa Esperança do Norte/MT.
- SIM: óbitos com município ignorado, contados só na UF — 2023: 2234; 2024: 2279; 2025: 1072; 2026: 1031.
- SIM: códigos CID fora do catálogo (mantidos nos totais como `???`) — 2023: nenhum; 2024: {'D969': 1, 'J489': 1, 'K390': 1}; 2025: {'C369': 1, 'I599': 1, 'I969': 1, 'M789': 1}; 2026: nenhum.
- SIM: códigos de município não resolvidos — 2023: nenhum; 2024: nenhum; 2025: {'416208': 1}; 2026: nenhum.
- INPE: 0 focos sem município resolvido, de 136393 (nomes resolvidos por nome exato + UF e por grafias antigas validadas por código).
- CNES: 0 estabelecimentos ativos sem município resolvido, de 457334.
- Arquivos legados (`dados/estados/2026`, removidos): 465095 registros; 305 sem resolução por nome + UF (0.07%), todos “Não identificado (código)”. Detalhe em `dados/relatorios/legado_municipios.json`.
- População: 5101837 sem p2022, p2024.

## Verificado no navegador

As sete áreas foram abertas em um servidor local sem erros no console; conferidos: análise municipal com óbitos, internações e dengue, recorte por sexo e idade, combinação indisponível, mapa por estado e por município, ficha de categoria e de subcategoria, comparação, associação exploratória, busca por teclado e largura de 375 px sem rolagem horizontal.

## Não verificado

- Leitores de tela e auditoria formal de contraste (WCAG 2.2 AA foi usada como referência no desenho, sem auditoria por ferramenta).
- Publicação no GitHub Pages (testado apenas em servidor local).
- Situação preliminar ou definitiva dos arquivos de 2023 e 2024 do SIM: a API do portal de dados abertos não respondeu na coleta.

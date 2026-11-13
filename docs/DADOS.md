# Dicionário de dados

Gerado a partir de `dados/indicadores/dicionario.json` e dos manifestos em `dados/manifestos/`. Todos os CSV usam `;` como separador e UTF-8.

## Modelo

| Entidade | Arquivos | Chave |
| --- | --- | --- |
| Território | `dados/referencia/municipios.json` | código IBGE de 7 dígitos, como texto |
| Classificação | `dados/referencia/cid10.json`, `cid10_sub/<letra>.json` | código CID-10; a edição fica em `meta` |
| Eventos de saúde | `dados/saude/sim/<ano>/…`, `dados/saude/sih/<ano>.csv`, `dados/saude/dengue/casos.csv` | território × período × CID × fonte (× sexo e faixa, no perfil do SIM) |
| Denominadores | `dados/populacao/municipios.csv`, `uf.csv`, `censo2022_idade/<UF>.csv` | território × ano (× sexo e faixa) |
| Indicadores territoriais | `dados/indicadores/municipios.csv` + `dicionario.json` + `situacoes.json` | território × indicador |
| Relações doença–fator | `dados/conhecimento/base.json` | tema (intervalos CID) × indicador, com papel, mecanismo, limitações, ações e referências |
| Metadados | `dados/manifestos/*.json`, `dados/relatorios/*.json` | fonte |
| Valores atípicos | `dados/relatorios/outliers.csv` e `outliers.json` | tipo × medida × ano × município |

A mesma base é carregada em MySQL/MariaDB pelo `scripts/importar_mysql.py`, com o esquema de `sql/esquema.sql`: tabelas `uf`, `municipio`, `populacao`, `populacao_censo_idade`, `cid_capitulo`, `cid_grupo`, `cid_categoria`, `obito_municipio_cid`, `obito_municipio_perfil`, `obito_uf_cid`, `obito_uf_mes`, `internacao_municipio_capitulo`, `dengue_municipio`, `indicador`, `indicador_valor` (formato longo), `lacuna_dados`, `outlier`, `fonte` e `controle_carga`, e as visões `vw_taxa_obitos_capitulo` e `vw_resumo_municipio`. Valores ausentes não viram linha.

## Arquivos de eventos

| Arquivo | Colunas |
| --- | --- |
| `sim/<ano>/mun/<UF>.csv` | `mun`; `cid3` (categoria; `???` = código fora do catálogo); `n` óbitos |
| `sim/<ano>/perfil/<UF>.csv` | `mun`; `cap` (capítulo; 0 = fora do catálogo); `sexo` (M, F, I); `faixa` (idade inicial da faixa de 5 anos; 80 = 80 ou mais; `ign`); `n` |
| `sim/<ano>/mun_cap.csv` | `mun`; `cap`; `n` |
| `sim/<ano>/uf_cid.csv` | `uf`; `cid` (subcategoria quando informada); `n` — inclui óbitos com município ignorado |
| `sim/<ano>/uf_perfil.csv`, `uf_mes.csv` | por UF: capítulo × sexo × faixa; capítulo × mês |
| `sih/<ano>.csv` | `mun`; `cap`; `n` internações |
| `dengue/casos.csv` | `mun`; `ano` de notificação; `n` casos prováveis |

Combinação ausente = nenhum evento registrado no arquivo publicado. Não é prova de ausência da condição.

## Indicadores territoriais

| Id | Nome | Dimensão | Unidade | Ano | Fonte | Municípios com valor | Definição | Limitações |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `area_km2` | Área territorial | Demografia | km² | 2022 | SIDRA 4714 | 5570 de 5571 | Área da unidade territorial. |  |
| `densidade` | Densidade demográfica | Demografia | hab./km² | 2022 | SIDRA 4714 | 5570 de 5571 | População residente dividida pela área territorial. | Média do município inteiro: não mostra o adensamento dentro da área urbana. |
| `pct_urbana` | População em área urbana | Demografia | % | 2022 | SIDRA 9923 | 5570 de 5571 | População residente em situação urbana ÷ população residente total × 100. | A delimitação urbana segue a legislação municipal vigente no Censo. |
| `pct_60mais` | População com 60 anos ou mais | Demografia | % | 2022 | SIDRA 9514 | 5570 de 5571 | Residentes com 60 anos ou mais ÷ população residente × 100. | Estrutura etária de 2022; municípios mais envelhecidos tendem a ter mais óbitos por doenças crônicas sem que o risco em cada idade seja maior. |
| `pct_0a4` | População de 0 a 4 anos | Demografia | % | 2022 | SIDRA 9514 | 5570 de 5571 | Residentes de 0 a 4 anos ÷ população residente × 100. | Estrutura etária de 2022. |
| `agua_rede` | Domicílios abastecidos principalmente pela rede geral de água | Água, esgoto e resíduos | % | 2022 | SIDRA 6803 | 5570 de 5571 | Domicílios particulares permanentes ocupados que possuem ligação à rede geral e a usam como forma principal ÷ total de domicílios × 100. | Não mede intermitência, tratamento nem qualidade da água. Poço ou nascente não significam, por si, água insegura. |
| `agua_sem_rede` | Domicílios sem ligação à rede geral de água | Água, esgoto e resíduos | % | 2022 | SIDRA 6803 | 5570 de 5571 | Domicílios sem ligação com a rede geral de distribuição ÷ total de domicílios × 100. | Inclui poços profundos e outras soluções que podem ser adequadas; não mede a qualidade da água consumida. |
| `esgoto_rede` | Domicílios com esgoto ligado à rede geral ou pluvial | Água, esgoto e resíduos | % | 2022 | SIDRA 6805 | 5570 de 5571 | Domicílios com esgotamento por rede geral, rede pluvial ou fossa ligada à rede ÷ total de domicílios × 100. | Coleta não significa tratamento: o Censo não informa se o esgoto coletado é tratado. |
| `esgoto_precario` | Domicílios com esgotamento precário ou sem banheiro | Água, esgoto e resíduos | % | 2022 | SIDRA 6805 | 5570 de 5571 | Domicílios com fossa rudimentar ou buraco, vala, lançamento em rio, lago, córrego ou mar, outra forma, ou sem banheiro nem sanitário ÷ total de domicílios × 100. Agrupamento definido neste projeto a partir das categorias do Censo. | Fossa séptica não ligada à rede fica fora do numerador. Indicador domiciliar: não mede contato efetivo das pessoas com esgoto. |
| `sem_banheiro` | Domicílios sem banheiro nem sanitário | Água, esgoto e resíduos | % | 2022 | SIDRA 6805 | 5570 de 5571 | Domicílios que não tinham banheiro nem sanitário ÷ total de domicílios × 100. |  |
| `lixo_coletado` | Domicílios com lixo coletado | Água, esgoto e resíduos | % | 2022 | SIDRA 6892 | 5570 de 5571 | Domicílios com lixo coletado no domicílio ou em caçamba de serviço de limpeza ÷ total de domicílios × 100. | Não informa frequência da coleta nem a destinação final dos resíduos. |
| `lixo_queimado_ou_jogado` | Domicílios que queimam o lixo ou o jogam em terreno ou área pública | Água, esgoto e resíduos | % | 2022 | SIDRA 6892 | 5570 de 5571 | Domicílios com lixo queimado na propriedade ou jogado em terreno baldio, encosta ou área pública ÷ total de domicílios × 100. |  |
| `alfabetizacao` | Taxa de alfabetização (15 anos ou mais) | Vulnerabilidade social | % | 2022 | SIDRA 9543 | 5570 de 5571 | Pessoas de 15 anos ou mais que sabem ler e escrever ÷ pessoas de 15 anos ou mais × 100 (taxa publicada pelo IBGE). | Alfabetização declarada; não mede anos de estudo nem letramento em saúde. |
| `renda_media` | Rendimento domiciliar per capita médio | Vulnerabilidade social | R$ por mês | 2022 | SIDRA 10295 | 5570 de 5571 | Valor do rendimento nominal médio mensal domiciliar per capita dos moradores em domicílios particulares permanentes (Censo 2022, amostra). | Valor nominal de 2022, sem correção. A média é puxada por rendas altas; veja também a mediana. Resultado da amostra do Censo. |
| `renda_mediana` | Rendimento domiciliar per capita mediano | Vulnerabilidade social | R$ por mês | 2022 | SIDRA 10295 | 5570 de 5571 | Valor do rendimento nominal mediano mensal domiciliar per capita: metade dos moradores vive com até esse valor (Censo 2022, amostra). | Valor nominal de 2022, sem correção. Não é uma medida de pobreza oficial. Resultado da amostra do Censo. |
| `moradores_por_domicilio` | Média de moradores por domicílio | Vulnerabilidade social | pessoas | 2022 | SIDRA 9877 | 5570 de 5571 | Média de moradores em domicílios particulares. | Indicador indireto de adensamento domiciliar: não considera o número de cômodos ou dormitórios. |
| `ubs_10mil` | Unidades básicas e postos de saúde | Acesso e capacidade de saúde | por 10.000 hab. | 2025 | cnes_estabelecimentos.csv | 5571 de 5571 | Estabelecimentos ativos dos tipos posto de saúde e centro de saúde/unidade básica ÷ população × 10.000. Denominador: população estimada de 2025 (IBGE). Zero = nenhum estabelecimento ativo desse tipo no cadastro. | Cadastro administrativo: presença de estabelecimento não demonstra acesso efetivo, funcionamento, equipe completa nem qualidade. Moradores podem ser atendidos em municípios vizinhos. |
| `hospitais_100mil` | Hospitais e unidades mistas | Acesso e capacidade de saúde | por 100.000 hab. | 2025 | cnes_estabelecimentos.csv | 5571 de 5571 | Estabelecimentos ativos dos tipos hospital geral, hospital especializado e unidade mista ÷ população × 100.000. Denominador: população estimada de 2025 (IBGE). Zero = nenhum estabelecimento ativo desse tipo no cadastro. | Cadastro administrativo: presença de estabelecimento não demonstra acesso efetivo, funcionamento, equipe completa nem qualidade. Moradores podem ser atendidos em municípios vizinhos. |
| `urgencia_100mil` | Prontos-socorros e pronto atendimentos | Acesso e capacidade de saúde | por 100.000 hab. | 2025 | cnes_estabelecimentos.csv | 5571 de 5571 | Estabelecimentos ativos dos tipos pronto-socorro geral, pronto-socorro especializado e pronto atendimento ÷ população × 100.000. Denominador: população estimada de 2025 (IBGE). Zero = nenhum estabelecimento ativo desse tipo no cadastro. | Cadastro administrativo: presença de estabelecimento não demonstra acesso efetivo, funcionamento, equipe completa nem qualidade. Moradores podem ser atendidos em municípios vizinhos. |
| `focos_calor` | Focos de calor (queimadas) no ano | Ambiente | focos | 2025 | focos_br_todos-sats_2025.csv (satélite AQUA_M-T) | 5571 de 5571 | Número de focos detectados pelo satélite de referência do INPE (AQUA_M-T) dentro do município em 2025. Zero = nenhum foco detectado. | Foco de calor detectado por satélite é um indicador indireto: não mede a área queimada, a concentração de fumaça nem a exposição das pessoas. A fumaça se desloca por centenas de quilômetros; um município sem focos pode receber fumaça de outros. Nuvens e queimadas pequenas reduzem a detecção. |
| `focos_por_1000km2` | Focos de calor por 1.000 km² | Ambiente | focos por 1.000 km² | 2025 | focos_br_todos-sats_2025.csv (satélite AQUA_M-T) | 5570 de 5571 | Focos do satélite de referência em 2025 ÷ área territorial do município (IBGE, 2022) × 1.000. | Foco de calor detectado por satélite é um indicador indireto: não mede a área queimada, a concentração de fumaça nem a exposição das pessoas. A fumaça se desloca por centenas de quilômetros; um município sem focos pode receber fumaça de outros. Nuvens e queimadas pequenas reduzem a detecção. |
| `vab_agropecuaria` | Participação da agropecuária no valor adicionado | Trabalho e exposições | % | 2021 | SIDRA 5938 | 5569 de 5571 | Valor adicionado bruto da agropecuária ÷ valor adicionado bruto total do município × 100. | Indicador indireto do perfil econômico. Não mede número de trabalhadores nem exposição ocupacional; o valor pode ser atribuído ao município da sede da empresa. |
| `vab_industria` | Participação da indústria no valor adicionado | Trabalho e exposições | % | 2021 | SIDRA 5938 | 5569 de 5571 | Valor adicionado bruto da indústria ÷ valor adicionado bruto total do município × 100. | Indicador indireto do perfil econômico. Não mede número de trabalhadores nem exposição ocupacional; o valor pode ser atribuído ao município da sede da empresa. |
| `vab_servicos` | Participação da serviços (exceto setor público) no valor adicionado | Trabalho e exposições | % | 2021 | SIDRA 5938 | 5569 de 5571 | Valor adicionado bruto da serviços (exceto setor público) ÷ valor adicionado bruto total do município × 100. | Indicador indireto do perfil econômico. Não mede número de trabalhadores nem exposição ocupacional; o valor pode ser atribuído ao município da sede da empresa. |
| `vab_adm_publica` | Participação da administração, saúde e educação públicas no valor adicionado | Trabalho e exposições | % | 2021 | SIDRA 5938 | 5569 de 5571 | Valor adicionado bruto da administração, saúde e educação públicas ÷ valor adicionado bruto total do município × 100. | Indicador indireto do perfil econômico. Não mede número de trabalhadores nem exposição ocupacional; o valor pode ser atribuído ao município da sede da empresa. |

Célula vazia em `municipios.csv` = sem valor; o motivo (`indisponivel`, `suprimido`, `nao_se_aplica`) está em `situacoes.json`.

## Dimensões sem indicador municipal

| Dimensão | Situação | Motivo |
| --- | --- | --- |
| Clima e desastres | não integrado | O portal de dados históricos do INMET (portal.inmet.gov.br/dadoshistoricos) recusou a conexão nas tentativas de coleta de 12/11/2026. Mesmo disponível, a rede tem cerca de 600 estações automáticas: a maioria dos municípios não tem medição própria, e atribuir a estação mais próxima exigiria um método de interpolação documentado. Reconhecimentos de desastre (S2iD/Defesa Civil) não têm arquivo aberto estável para download automático. |
| Imunização | não integrado | O tabulador público de coberturas (TabNet, bd_pni/cpnibr.def) termina em 2022 e pertence ao sistema antigo (SI-PNI), anterior à migração para a RNDS. Os dados atuais são publicados como registros de doses aplicadas, sem a cobertura municipal calculada com o denominador oficial; calcular cobertura por conta própria misturaria denominadores. |
| Vetores e contexto sanitário | parcial | Não há arquivo nacional aberto de índices entomológicos (LIRAa/LIA) por município. O painel usa os casos prováveis de dengue do SINAN como informação de vigilância, que é um desfecho, não uma medida de infestação. |
| Comportamento e nutrição | fora do escopo | Dimensão deixada de fora desta entrega. PNS e Vigitel não produzem estimativas para todos os municípios; valores de capitais ou estados não podem ser atribuídos aos municípios. |
| Qualidade do ar | não integrado | Não existe rede nacional de monitoramento com cobertura municipal. Focos de calor do INPE entram como indicador indireto de queimadas, não como medida de fumaça ou de exposição. |

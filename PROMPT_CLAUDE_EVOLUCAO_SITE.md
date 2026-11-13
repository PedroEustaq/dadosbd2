# Prompt para o Claude — evolução do painel de saúde territorial

## Como usar

Abra este repositório no Claude com acesso aos arquivos e envie:

> Leia integralmente `PROMPT_CLAUDE_EVOLUCAO_SITE.md`, examine o projeto atual e implemente as alterações solicitadas. Use este documento como especificação funcional, visual, técnica e de qualidade dos dados. Trabalhe no site existente, conecte dados públicos reais e valide os resultados. Não se limite a apresentar um plano ou uma proposta de layout. Registre claramente o que foi implementado e qualquer limitação de cobertura das fontes.

---

## 1. Sua tarefa

Atue como desenvolvedor responsável pelo projeto, com atenção a engenharia de dados, análise epidemiológica e experiência de uso. Transforme o painel existente em uma plataforma profissional, acessível e fácil de usar para explorar doenças e condições classificadas pela CID nos municípios brasileiros e investigar fatores territoriais que possam contribuir para os indicadores observados.

A plataforma deve ajudar uma pessoa sem conhecimento técnico a responder:

- Quais doenças têm mais registros no meu município e em qual período?
- O indicador é elevado em relação à população e a territórios comparáveis?
- Trata-se de óbitos, internações, notificações ou casos novos?
- Quais condições ambientais, sociais, econômicas e de acesso à saúde podem estar relacionadas?
- Que dados sustentam essa interpretação e quais informações estão faltando?
- Que ações de prevenção e melhorias coletivas têm respaldo em fontes confiáveis?

Saneamento básico é apenas um exemplo. Amplie os cruzamentos para os demais determinantes relevantes, conforme a disponibilidade e a qualidade dos dados. A meta é oferecer a maior cobertura útil e verificável, sem prometer informações inexistentes ou explicações causais que os dados não sustentam.

Implemente funcionalidades reais, com fontes rastreáveis e documentação reproduzível. Não apresente números inventados, resultados simulados ou textos genéricos como se fossem análises municipais.

## 2. Contexto real do repositório

Antes de alterar arquivos, leia as instruções locais aplicáveis, o `README.md` e o código. Verifique o estado do Git e preserve mudanças já existentes do usuário.

O projeto atual tem estas características, que devem ser confirmadas na inspeção:

- Site estático em português do Brasil, sem etapa de build, preparado para GitHub Pages.
- `index.html` é a entrada; `assets/css/styles.css` contém os estilos.
- JavaScript dividido em `assets/js/config.js`, `utils.js`, `mapa.js`, `dados.js`, `painel.js` e `main.js`, carregados nessa ordem e com escopo compartilhado.
- Leaflet para mapas e Papa Parse para leitura de CSV, atualmente carregados por CDN.
- Dados em `dados/estados/2026/`, separados por UF; geometrias em `dados/geo/` e `dados/geo/municipios/`.
- Scripts Python em `scripts/gerar_dados_por_uf.py` e `scripts/gerar_geo.py`.
- O README descreve a 2ª prévia do SIM 2026 e um recorte de causa básica CID-10: C00–C97, E10–E14, I00–I99 e J40–J47.
- O script de preparação contém uma função `chronic_cause` que limita esse recorte. Expandir o catálogo da interface não amplia automaticamente os dados importados.
- O mapa alterna entre estados e municípios e carrega geometrias municipais por UF sob demanda.
- Existem filtros territoriais e de perfil, busca por CID, comparação entre estados, importação local de CSV e tabela de registros.
- O mapa atual calcula proporções dentro do recorte de óbitos carregado; isso não equivale à incidência, à mortalidade por população ou à proporção sobre todos os óbitos do SIM.
- Embora o nome da coluna `co_municipio_ibge_residencia` sugira um código, há arquivos atuais com nomes de municípios nessa coluna. Inspecione os valores antes de fazer junções; não trate esses nomes como códigos IBGE.

Use essa base e corrija ambiguidades de nomenclatura, denominadores e integração geográfica. Não reescreva todo o sistema sem necessidade. Preserve a possibilidade de executar localmente com `python3 -m http.server 8000` e publicar o frontend no GitHub Pages. Se alguma capacidade realmente exigir outra arquitetura, documente o motivo e mantenha uma alternativa estática funcional sempre que possível.

## 3. Cobertura da CID e informações sobre doenças

Crie um catálogo pesquisável de toda a CID-10 da edição oficial selecionada, com capítulos, agrupamentos, categorias e subcategorias quando disponíveis. Informe edição, idioma, origem e data de atualização. Inclua também as condições, causas externas e outros itens classificados que não são propriamente doenças, com rótulos adequados.

Use a CID-10 como classificação inicial para compatibilidade com os dados existentes. Prepare o modelo para outras versões, incluindo CID-11, sem misturar códigos ou presumir equivalência automática. Qualquer correspondência entre versões precisa de fonte e indicação das limitações.

Permita pesquisa por código com ou sem ponto, nome e sinônimos documentados, ignorando acentos. Mostre a hierarquia e permita selecionar tanto grupos quanto códigos específicos, evitando dupla contagem de categorias e subcategorias.

Na página de cada doença ou condição, apresente:

- Código, nome oficial, descrição acessível e posição na hierarquia.
- Dados territoriais disponíveis, separados por tipo de evento e período.
- Fatores de risco, transmissão quando aplicável, fatores de agravamento e medidas de prevenção, com referências.
- Indicadores territoriais relevantes para investigação e explicação de sua pertinência.
- Cobertura efetiva: fontes, municípios, períodos e desfechos disponíveis.

Separe o catálogo classificatório da disponibilidade epidemiológica e da cobertura de conteúdo explicativo. Um código pode constar do catálogo e não ter registros locais, informação preventiva revisada ou série disponível. Mostre essa situação explicitamente; não oculte o código nem preencha lacunas com informação inventada.

Não considere automaticamente zero a ausência de registros, e não presuma que existam bases municipais de incidência para todas as doenças da CID.

## 4. Dados públicos e determinantes a investigar

Pesquise fontes primárias e valide cada arquivo, tabela ou serviço antes de implementar um conector. Os portais abaixo são pontos de partida, não garantia de que cada variável esteja disponível em qualquer município ou ano.

| Dimensão | Indicadores a procurar | Fontes candidatas e cuidados |
| --- | --- | --- |
| Mortalidade | Óbitos por causa básica, idade, sexo, período e residência | SIM / Ministério da Saúde; preservar condição preliminar ou definitiva e distinguir residência de ocorrência. |
| Morbidade e vigilância | Notificações, casos confirmados e internações por condição | SINAN, SIH/SUS, SIVEP-Gripe e bases específicas pertinentes; verificar definição de caso, revisões e abrangência. Internações do SUS não representam todos os doentes nem necessariamente pessoas únicas. |
| Demografia | População, estrutura etária, sexo, densidade, urbanização | IBGE, Censo, estimativas e SIDRA; usar denominadores compatíveis com território, período e perfil. |
| Água, esgoto e resíduos | Abastecimento, coleta e tratamento de esgoto, resíduos, drenagem | SINISA, séries históricas do SNIS e Censo; documentar mudanças metodológicas e cobertura. |
| Vulnerabilidade social | Renda, pobreza, escolaridade, adensamento domiciliar e condições de moradia | IBGE e outros levantamentos públicos compatíveis; verificar disponibilidade municipal e defasagem. |
| Clima e desastres | Chuva, temperatura, umidade, ondas de calor, seca e enchentes | INMET, INPE, ANA e Cemaden conforme acesso e cobertura; documentar agregação espacial e temporal. |
| Ambiente | Queimadas, fumaça, qualidade do ar, uso do solo e desmatamento | INPE, órgãos ambientais, ANA e MapBiomas quando pertinente e permitido; focos de fogo são um indicador indireto, não uma medição de exposição individual. |
| Acesso e capacidade de saúde | Estabelecimentos, equipes, profissionais, atenção primária e oferta assistencial | CNES, SISAB e painéis oficiais pertinentes; presença de serviço não demonstra acesso efetivo nem qualidade. |
| Imunização | Cobertura por vacina, público-alvo e período | SI-PNI e publicações oficiais; conferir mudanças de sistema, denominadores e possíveis inconsistências. |
| Comportamento e nutrição | Tabagismo, álcool, alimentação, atividade física, obesidade e estado nutricional | PNS, Vigitel e SISVAN conforme desenho e cobertura. Não atribuir estimativas de capitais ou estados a todos os municípios; usuários acompanhados não representam necessariamente a população inteira. |
| Trabalho e exposições | Atividades econômicas, acidentes e exposições ocupacionais documentadas | IBGE, bases oficiais de trabalho e vigilância em saúde; atividade econômica é um possível indicador indireto, não prova de exposição. |
| Vetores e contexto sanitário | Indicadores entomológicos, vigilância e alertas disponíveis | Ministério da Saúde e órgãos locais; não extrapolar levantamentos pontuais para territórios sem medição. |

Pontos de partida oficiais:

- [Dados abertos do Ministério da Saúde](https://dadosabertos.saude.gov.br/).
- [Transferência de arquivos do DATASUS](https://datasus.saude.gov.br/transferencia-de-arquivos/).
- [Documentação das APIs do IBGE](https://servicodados.ibge.gov.br/api/docs).
- [SIDRA / IBGE](https://sidra.ibge.gov.br/).
- [Resultados SINISA / Ministério das Cidades](https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/saneamento/sinisa/resultados-sinisa).
- [Classificação Internacional de Doenças / OMS](https://www.who.int/standards/classifications/classification-of-diseases).

Localize e registre os endereços oficiais exatos das demais fontes utilizadas. Para relações doença–fator e prevenção, priorize Ministério da Saúde, Fiocruz, OMS, OPAS e literatura científica primária pertinente. A classificação CID, sozinha, não fornece uma explicação territorial das causas.

Para cada conjunto de dados, mantenha um manifesto com identificador, instituição, URL da página e do recurso utilizado, licença ou condições de uso, versão, período de referência, data de publicação e coleta, granularidade territorial, unidade, definição, cobertura, campos, valores ausentes, limitações e comando de atualização. Não invente endpoints nem exponha credenciais no frontend.

## 5. Integração e qualidade dos dados

Implemente uma camada reproduzível de preparação e validação, preferencialmente com os scripts Python do projeto, para gerar arquivos agregados que o frontend estático consiga consumir.

O modelo deve distinguir pelo menos:

- Territórios e seus identificadores oficiais.
- Classificação CID e edição.
- Eventos de saúde agregados por território, período, CID, fonte e perfil disponível.
- Denominadores populacionais.
- Indicadores territoriais, unidade, referência temporal e origem.
- Relações documentadas entre doença e fator, com mecanismo, referência e limitações.
- Resultados analíticos e metadados necessários para reproduzi-los.

Regras obrigatórias:

1. Use código IBGE municipal canônico como texto. Quando a fonte utilizar seis dígitos, faça correspondência validada com a tabela oficial; não complete códigos por suposição.
2. Para os arquivos atuais com nomes de municípios, resolva por nome e UF usando tabela de correspondência, trate homônimos e acentos e gere relatório de itens não resolvidos. Não faça junções silenciosas por nome isolado ou aproximação incerta.
3. Considere mudanças territoriais e a versão das malhas; documente compatibilizações históricas.
4. Distinga residência, ocorrência, internação e local da exposição. O município de atendimento não deve ser interpretado automaticamente como município de risco.
5. Alinhe períodos e granularidades. Se usar um indicador antigo como contexto, mostre os dois anos e a defasagem. Não apresente essa combinação como medição contemporânea.
6. Não replique indicadores estaduais ou de capitais como observações municipais.
7. Preserve a diferença entre zero observado, ausência de registro, dado indisponível, suprimido, não aplicável e erro de importação.
8. Valide duplicidades, unidades, códigos, datas, campos obrigatórios e totais por fonte. Evite somar eventos de sistemas diferentes como se fossem pessoas únicas.
9. Não some notificações cumulativas de revisões sucessivas nem subcategorias junto com seus totais.
10. Registre erros de junção, cobertura territorial e proporção de dados ausentes. Uma fonte parcialmente disponível não pode aparentar cobertura nacional completa.

## 6. Indicadores e comparação entre municípios

Ofereça indicadores claramente nomeados, de acordo com o que cada fonte realmente permite calcular:

- Contagem absoluta de eventos.
- Taxa de mortalidade: óbitos / população compatível × 100.000.
- Taxa de internações: internações / população compatível × 100.000, identificando a cobertura do sistema.
- Incidência somente quando houver casos novos, população sob risco e período adequados; quando isso não existir, use a denominação correta, como taxa de notificações.
- Proporção entre eventos de um universo explicitado. Para o painel legado, escreva “participação nos óbitos do recorte selecionado” enquanto só houver esse recorte.
- Tendência e comparação com UF, Brasil e municípios comparáveis, quando metodologicamente viáveis.

Sempre exiba numerador, denominador, unidade, período, fonte e filtros. Se um filtro de idade ou sexo não possuir denominador correspondente, não calcule uma taxa específica usando a população total. Não anualize automaticamente uma prévia de ano incompleto nem a compare com um ano completo sem ajuste explícito.

Para definir “indicador elevado”, implemente critério transparente e reproduzível com referência e intervalo de incerteza quando cabível. Quantis de cores mostram posição relativa e não comprovam risco aumentado, surto ou significância estatística. Evite rankings baseados apenas em totais absolutos.

Considere estrutura etária, tamanho populacional, cobertura dos sistemas, atraso de notificação e estabilidade das estimativas. Ofereça padronização por idade somente se houver dados e população padrão documentados. O limiar atual de 20 óbitos é uma regra visual do painel legado, não um critério universal de estabilidade ou privacidade; avalie regras adequadas a cada indicador.

## 7. Cruzamentos e explicação dos possíveis fatores

Esta é a funcionalidade central. Para cada município, doença, desfecho e período selecionados, produza uma explicação compreensível, sustentada por dados locais e referências.

Implemente dois componentes distintos:

1. **Base de conhecimento documentada:** relações entre doenças e fatores de risco, proteção ou agravamento, com referências e mecanismo plausível. Diferencie causa, transmissão, agravamento, acesso ao diagnóstico e associação indireta.
2. **Análise territorial:** busca de indicadores locais compatíveis, comparação com referências e avaliação da qualidade dos dados. Só relacione um fator à situação local quando houver dados pertinentes; sem isso, mostre apenas a informação geral com esse rótulo.

Para os fatores com dados compatíveis, exiba:

- Valor local, referência comparativa, unidade, fonte e período.
- Motivo pelo qual esse fator merece investigação para a condição escolhida.
- Tipo de evidência: observação local, associação estatística exploratória ou relação descrita na literatura.
- Limitações, informações ausentes e possíveis explicações alternativas.
- Ações coletivas pertinentes e referências que as sustentam.

Uma relação conhecida na literatura não demonstra que ela explica o excesso observado naquele município. Uma coincidência entre indicadores também não comprova causalidade. Dados agregados não permitem concluir que os indivíduos que adoeceram eram os expostos ao fator.

Se implementar correlações, calcule-as sobre observações suficientes de municípios ou períodos comparáveis, nunca sobre um único par de valores. Mostre método, tamanho da amostra, dados excluídos, defasagens, incerteza e limitações. Considere confundimento, sazonalidade, dependência espacial e múltiplas comparações; não apresente correlação simples como descoberta causal.

Comece com regras explicáveis e cruzamentos verificáveis. Não atribua “probabilidade de causa”, “porcentagem de culpa” ou confiança numérica sem modelo validado. Se ordenar fatores, documente os critérios de relevância e cobertura; a ordem não deve aparentar um ranking de causas comprovadas.

O site deve conseguir responder “não há evidência suficiente para explicar este padrão com os dados disponíveis”. Essa resposta deve informar quais dados faltam e permitir consultar o restante do painel.

Não é obrigatório usar um modelo de linguagem em produção. Prefira explicações estruturadas e rastreáveis. Se houver geração de texto, ela deve se apoiar exclusivamente nos dados e referências recuperados, com validação e sem chaves expostas no navegador.

## 8. Melhorias e prevenção

Apresente ações relacionadas ao fator analisado e ao contexto disponível, distinguindo:

- Ações do poder público: infraestrutura, vigilância, atenção primária, vacinação, monitoramento ambiental e políticas sociais, conforme pertinência.
- Ações comunitárias: mobilização, eliminação de riscos coletivos e acesso à informação.
- Orientações gerais de prevenção para a população, fundamentadas e sem diagnóstico ou prescrição individual.

Cada ação deve explicar qual problema busca enfrentar, qual relação possui com a doença, sua fonte e quais limitações impedem estimar o efeito local. Não invente redução percentual de casos, economia ou prazo de resultado.

Exemplos de fluxos a suportar, apenas quando houver evidência e dados adequados:

- Investigar doenças de transmissão hídrica em relação a abastecimento, esgotamento e eventos de inundação.
- Investigar condições respiratórias em relação a indicadores de fumaça, qualidade do ar, clima e acesso ao cuidado.
- Investigar agravos transmitidos por vetores em relação a clima, vigilância e condições ambientais.
- Explorar desfechos crônicos em relação a estrutura etária, vulnerabilidade social e acompanhamento em saúde, respeitando a cobertura dos indicadores comportamentais.

Esses são casos de uso, não conclusões prontas sobre qualquer município.

## 9. Experiência de uso e apresentação profissional

O público inclui cidadãos, estudantes e gestores. Toda a interface deve ser em português do Brasil, com linguagem simples, visual consistente, boa hierarquia, tipografia legível, espaçamento adequado e cores acessíveis.

Organize a navegação em áreas claras:

1. **Visão geral:** busca principal por município ou doença e resumo do que pode ser explorado.
2. **Explorar o mapa:** Brasil, estados e municípios, com legenda, métrica e período sempre visíveis.
3. **Meu município:** perfil territorial, indicadores de saúde, tendências, comparação e fatores a investigar.
4. **Doenças e CID:** catálogo completo e fichas explicativas com cobertura dos dados.
5. **Comparar locais:** municípios e estados, respeitando comparabilidade.
6. **Fatores e melhorias:** evidências locais, relações documentadas e medidas pertinentes.
7. **Fontes e metodologia:** origem, atualização, fórmulas, cobertura e limitações.

O fluxo principal deve ser: escolher município → escolher doença ou grupo → escolher período e tipo de evento → ver indicadores → entender fatores relacionados → consultar melhorias e fontes.

Requisitos de interação:

- Usar as funções principais sem cadastro nem conhecimento de CID.
- Buscar municípios por nome e UF, com sugestões claras e suporte a teclado.
- Mostrar filtros aplicados, permitir removê-los e oferecer “Limpar filtros”.
- Manter filtros avançados recolhidos inicialmente, sem exigir configurações complexas para começar.
- Sincronizar mapa, cartões, gráficos e tabelas; impedir respostas antigas de sobrescrever seleções recentes.
- Mostrar carregamento, falha de fonte, indisponibilidade e ausência de resultados com mensagens úteis.
- Explicar termos como taxa, notificação e dado preliminar junto ao uso, com detalhes opcionais.
- Oferecer alternativa em tabela para informações do mapa e dos gráficos.
- Permitir compartilhar a seleção por URL e exportar agregados em CSV com fontes, períodos, unidades e filtros, respeitando supressões.
- Oferecer impressão legível ou relatório simples da análise municipal.

No celular, reorganize o conteúdo e os filtros sem rolagem horizontal da página. Garanta foco visível, rótulos, contraste, alvos de toque adequados e informação que não dependa apenas de cor ou de passar o mouse. Use WCAG 2.2 AA como referência e valide os requisitos pertinentes na documentação oficial.

Preserve mapas e funcionalidades úteis existentes. Ajuste a paleta para a expansão da CID, evitando depender das quatro cores e quatro categorias atuais. Na comparação entre locais, mantenha escalas e legendas comparáveis; deixe explícito quando uma escala mudar.

## 10. Arquitetura, desempenho e publicação

- Mantenha separadas interface, dados, cálculos, regras explicativas e referências.
- Pré-processe e agregue os dados volumosos; não obrigue o navegador a baixar todos os microdados do Brasil para abrir a página.
- Use particionamento por fonte, período e UF, índices leves, cache e carregamento sob demanda.
- Preserve o carregamento municipal por UF e impeça requisições duplicadas ou resultados obsoletos.
- Defina cache e versão dos arquivos para não misturar dados de atualizações diferentes.
- Prefira arquivos preparados localmente para fontes com CORS, autenticação ou formatos incompatíveis com o navegador. Documente a atualização sem depender de um servidor privado permanente.
- Scripts de coleta devem ter validação, mensagens de erro, limites e retomada quando pertinente, respeitando as condições dos provedores.
- Não inclua bases brutas grandes no Git. Documente dependências e comandos de preparação.
- Publique apenas os dados necessários à análise. Revise a tabela atual de registros individuais e priorize agregados, com supressão de células pequenas e combinações que permitam identificação. Documente a política sem inventar um limiar universal.
- Trate arquivos e textos externos como entrada não confiável e evite inserção de HTML não sanitizado.
- Faça a evolução com justificativa técnica; não imponha framework, backend pago ou chave de IA para funções que podem funcionar na arquitetura existente.

## 11. Sequência de implementação e entregáveis

Execute o trabalho em incrementos funcionais. Comece pelo diagnóstico do repositório e das fontes; em seguida entregue um fluxo completo com dados reais antes de ampliar as integrações. Esse fluxo inicial não substitui o escopo de catálogo completo e expansão territorial.

Ordem sugerida:

1. Auditar dados e denominadores atuais, corrigir junções municipais e ambiguidades e documentar a cobertura inicial.
2. Implementar catálogo CID e modelo de fontes, desfechos, população e indicadores territoriais.
3. Entregar uma análise municipal completa com pelo menos uma fonte de saúde, população e um determinante territorial real, alinhados por município e período.
4. Implementar explicações e recomendações rastreáveis, com tratamento de dados insuficientes.
5. Expandir fontes, desfechos e determinantes conforme viabilidade validada.
6. Finalizar navegação, responsividade, acessibilidade, exportação, desempenho e documentação.

Entregue:

- Código implementado no repositório e interface funcional.
- Scripts reproduzíveis de importação, normalização, agregação e atualização.
- Manifestos de fontes e dicionário dos dados.
- Documentação de fórmulas, regras de comparação, cruzamentos e limitações.
- Matriz de cobertura real por fonte, desfecho, período e nível territorial.
- README atualizado com execução local, preparação e publicação no GitHub Pages.
- Relatório curto das validações realizadas e das pendências concretas.

Não peça confirmação a cada decisão técnica rotineira. Se uma fonte estiver indisponível, procure alternativa oficial compatível, registre a falha e continue nas partes independentes. Não marque conectores planejados como implementados. Caso uma etapa dependa de acesso que você não possui, indique exatamente o impedimento, sem simular sua conclusão.

## 12. Critérios de aceitação

Considere os requisitos atendidos apenas quando puder demonstrar:

- Catálogo completo da edição CID-10 selecionada, validado contra a fonte oficial, com busca e hierarquia; cobertura explicativa e epidemiológica identificadas separadamente.
- Busca de um município real e acesso às doenças com dados disponíveis, sem confundir ausência de informação com zero.
- Um caminho completo de análise com fontes reais, códigos municipais validados e períodos compatíveis ou defasagem explícita.
- Taxas corretas com denominadores apropriados e proporções com universo identificado.
- Informações de possíveis fatores associadas aos valores locais e às referências correspondentes.
- Medidas de melhoria relacionadas ao fator e sustentadas por fontes.
- Separação visual e textual entre fato observado, associação, hipótese e informação geral.
- Estados úteis de indisponibilidade, amostra pequena, falta de denominador e dados preliminares.
- Comparação entre locais com métrica, período e filtros consistentes.
- Navegação utilizável em desktop e celular, por teclado e sem depender exclusivamente do mapa.
- Atualização dos dados reproduzível, com relatório de cobertura e erros de junção.
- Execução local e compatibilidade com a publicação estática preservadas.

Valide os cálculos com exemplos conferíveis, incluindo divisão por zero, denominador ausente, filtro de idade/sexo, ano parcial, códigos CID hierárquicos e municípios homônimos. Teste trocas rápidas de filtros, falhas de carregamento, exportação e funcionamento em telas pequenas. Confira uma amostra dos totais e cruzamentos com as fontes originais.

Ao terminar, explique de forma objetiva o que mudou, quais dados estão integrados, como executar, como atualizar, o que foi validado e quais limitações permanecem. Não afirme que o sistema explica a causa de todas as doenças: a entrega deve permitir investigação territorial responsável e tornar explícito até onde os dados sustentam cada conclusão.

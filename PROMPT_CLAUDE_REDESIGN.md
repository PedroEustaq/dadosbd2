# Redesign completo — Saúde no Território

## Mensagem para enviar ao Claude

> Leia integralmente `PROMPT_CLAUDE_REDESIGN.md` e implemente o redesign solicitado no site existente. As funcionalidades atuais foram aprovadas; o foco desta etapa é refazer a experiência visual, a organização da informação e a navegação. Preserve dados, cálculos e capacidades existentes. Examine as telas, reorganize o conteúdo e valide o resultado em navegador, no computador e no celular. Não se limite a mudar cores, fontes e bordas.

## Objetivo desta etapa

As funcionalidades ficaram excelentes, mas a apresentação precisa de uma revisão completa. Quero um site profissional, contemporâneo, simples e efetivo, em que seja fácil perceber o que importa e qual é o próximo passo.

O problema central é a quantidade de elementos concorrendo pela atenção: controles, cartões, selos, explicações, tabelas e avisos. Refazer o design significa decidir o que aparece primeiro, o que deve ser consultado sob demanda e o que é redundante.

Reavalie cada elemento: qual pergunta do usuário ele responde? Ele precisa aparecer nesta tela e neste momento? Existe outra informação igual? Se não agrega, remova a repetição. Se é útil apenas em uma investigação aprofundada, mantenha acessível no contexto apropriado.

Preserve todas as capacidades úteis. Reduza a exposição simultânea de detalhes, sem eliminar acesso a análises, fontes e informações necessárias para interpretar os resultados.

## Diagnóstico baseado no código atual

Esta análise foi feita a partir do HTML, do CSS e das funções que geram as telas. Não representa uma inspeção visual renderizada nem uma auditoria das fórmulas. Confirme os problemas em navegador antes de redesenhar e compare as telas depois.

| Problema identificado | Evidência no projeto | Mudança esperada |
| --- | --- | --- |
| Entrada duplicada para a mesma tarefa | `index.html` mantém a barra global; `renderInicio`, em `assets/js/painel.js`, cria novamente buscas de município e doença. A barra só é ocultada na rota de fontes, em `assets/js/main.js`. | Na entrada, apresentar uma busca principal clara; nas análises, usar uma seleção contextual compacta. |
| Muitos caminhos com peso semelhante | Sete links no cabeçalho; seis cartões de navegação na página inicial, além das buscas e dos demais blocos. | Definir navegação principal enxuta, com destinos secundários acessíveis e tarefas relacionadas agrupadas. |
| Home funcionando como documentação | `renderInicio` inclui tabela detalhada de cobertura, indicadores disponíveis, instruções e ressalva, além da apresentação e dos atalhos. | Priorizar começar uma consulta; transferir documentação detalhada para fontes, ajuda ou detalhes contextuais. |
| Ausência de resumo efetivo dos fatores | `renderMunicipio` chama `fatoresHtml(..., { resumo:true })`, mas `fatoresHtml`, em `assets/js/conteudo.js`, termina incluindo todos os `blocos`. O trecho `${resumo ? "" : ""}` não reduz o conteúdo. | Implementar um resumo real na tela municipal, com acesso explícito à análise completa. |
| Repetição dos mesmos números | `resultadoHtml`, em `assets/js/painel.js`, mostra KPIs, texto com valores observados/esperados e tabela com os valores do município e das referências. | Escolher uma representação principal; manter a tabela completa em uma visualização alternativa ou aprofundamento. |
| Linguagem de relatório na leitura principal | KPIs usam rótulos como “numerador” e “denominador”; a explicação da comparação apresenta razão, intervalo e padronização em sequência. | Começar com uma síntese compreensível; disponibilizar os detalhes estatísticos junto à comparação. |
| Excesso de recipientes visuais | CSS aplica bordas, fundo, arredondamento e sombra a `.card`; dentro deles há `.kpi`, `.veredito`, `.fator`, `.fator-local`, notas e outros blocos. | Usar espaço, alinhamento, tipografia e divisores leves para estruturar; reservar cartões para agrupamentos que precisam deles. |
| Selos competindo com os dados | `.tag` define etiquetas em maiúsculas e várias cores; `etiqueta` é repetida em KPIs, títulos, textos e fatores. | Preservar a distinção entre observado, comparação e hipótese com rótulos discretos e menos repetidos. |
| Página de fatores extensa por padrão | `renderFatores` produz tabelas de todas as dimensões do território, e também uma tabela de lacunas; melhorias podem abrir automaticamente nos fatores desfavoráveis. | Mostrar primeiro os fatores pertinentes à consulta; deixar perfil completo, lacunas e aprofundamentos em áreas próprias. |
| Celular depende principalmente de empilhamento | As regras responsivas convertem várias grades em uma coluna. | Projetar prioridades, filtros e navegação específicos para tela estreita, evitando transformar toda a página desktop em uma coluna longa. |

## Direção visual

Adote uma linguagem de ferramenta pública de consulta e análise: sóbria, clara e atual, com identidade consistente e foco no conteúdo.

- Fundo neutro claro e superfícies discretas; uma cor principal de interação.
- Cores de situação e de dados com significado consistente, usadas com moderação. Evite usar cor de alerta em informação meramente explicativa.
- Tipografia com hierarquia perceptível entre título, informação principal, apoio e metadados. Números importantes devem ser fáceis de comparar.
- Espaçamento generoso entre assuntos e compacto dentro do mesmo agrupamento; alinhamento consistente.
- Bordas sutis e sombras pontuais. Evite caixas dentro de caixas sem necessidade.
- Ícones apenas quando ajudarem a identificar uma ação; sempre com nome acessível e sem exigir interpretação de símbolos desconhecidos.
- Componentes coerentes entre todas as telas: buscas, filtros, botões, listas, gráficos, tabelas e estados de interação.
- Animações breves e funcionais, com respeito à preferência por movimento reduzido.

Modernização deve melhorar a consulta. Não acrescente ilustrações decorativas, números de destaque sem utilidade, banners grandes, carrosséis, gradientes chamativos ou novas seções promocionais para preencher espaço.

## Arquitetura da informação

Proponha e implemente uma navegação organizada por tarefas. Um agrupamento inicial possível é:

- **Explorar:** entrada, mapa e análise municipal.
- **Doenças:** busca e catálogo CID.
- **Comparar:** comparação entre territórios.
- **Fontes e metodologia:** destino secundário, sempre acessível.

Fatores e melhorias devem ter acesso direto no contexto da análise municipal. Preserve também o acesso à rota existente, inclusive por links compartilhados. Agrupar destinos no menu não autoriza apagar funcionalidades.

Cada tela deve ter uma pergunta principal e um elemento dominante que a responda. Uma pessoa deve conseguir identificar onde está, qual consulta está ativa e como alterá-la.

Organize a informação em três profundidades:

1. **Leitura inicial:** resultado principal, contexto indispensável e próxima ação.
2. **Investigação:** tendências, comparações, fatores e ações relacionadas.
3. **Verificação:** dados completos, intervalos, critérios, referências e metodologia.

Use abas, seções ou expansões apenas quando ajudarem esse percurso. Evite resolver tudo com menus escondidos, acordeões aninhados ou detalhes que obriguem a abrir várias partes para entender um único resultado.

## Requisitos por tela

### Entrada

Apresente uma frase curta sobre a utilidade do site e uma busca principal por município. Disponibilize começar por doença como alternativa clara, sem duas áreas diferentes oferecendo os mesmos filtros.

A primeira tela deve comunicar a proposta e permitir iniciar uma consulta. Cobertura detalhada, catálogos de fontes, instruções longas e listagem de todas as funcionalidades devem sair da leitura inicial. Se houver atalhos, use poucos e priorize ações reais.

### Análise municipal

Mostre município e UF, doença ou grupo, tipo de evento e período de forma compacta. Permita alterar a consulta sem manter um formulário grande permanentemente aberto.

Na leitura inicial, priorize:

- A taxa, com unidade, período e informação necessária à interpretação.
- O número registrado como apoio.
- A comparação com a referência, em linguagem simples e com sua limitação essencial.

População, origem do denominador e detalhes estatísticos devem continuar acessíveis próximos ao resultado, com menor peso visual. Não é preciso repetir a mesma informação em cartão, parágrafo e tabela aberta ao mesmo tempo.

Organize o aprofundamento em áreas como panorama, evolução, fatores e melhorias. O panorama pode mostrar uma síntese curta de fatores relevantes com “Ver análise completa”. Não renderize a análise completa dentro do suposto resumo.

Quando houver uma comparação ajustada válida que mude a interpretação da comparação bruta, isso precisa aparecer na síntese. Não esconda essa diferença em metodologia.

### Mapa

O mapa deve ser o elemento principal, com espaço suficiente para exploração. A consulta ativa e a legenda devem permanecer claras.

Agrupe controles relacionados, sem espalhar botões e explicações pela superfície. Uma tabela equivalente deve continuar acessível por opção explícita, sem exigir uma tabela longa aberta abaixo do mapa por padrão.

Mantenha o acesso por teclado e a alternativa textual. Garanta que painéis, legendas e controles não encubram o território selecionado, especialmente no celular.

### Doenças e CID

Priorize busca por nome comum ou código. A hierarquia completa pode ocupar um painel secundário, aberto quando solicitado.

Organize a ficha com nome, código, resumo e ação de análise. Separe dados territoriais, fatores/prevenção e informações classificatórias. Não apresente toda a cobertura por fonte e todas as subcategorias como conteúdo principal aberto.

### Comparação

Priorize seleção dos locais e visualização comparável. Mantenha medida, período e referência consistentes e evidentes.

Use tabela ou gráfico conforme a pergunta, evitando duplicações simultâneas sem benefício. Exportação e detalhes de cálculo devem ter posição secundária.

### Fatores e melhorias

Comece pela síntese do que os dados locais permitem investigar, associada à doença e ao período escolhidos. Exiba fatores com título curto, valor local e referência, explicação breve e acesso às ações relacionadas.

Deixe limitações extensas, definições e referências completas disponíveis junto ao fator, com organização consistente. A ressalva essencial sobre associação e causalidade deve continuar perceptível.

O perfil com todos os indicadores e a relação completa de lacunas devem estar acessíveis como aprofundamento, sem competir com os fatores relevantes à consulta. Não transforme ausência de associação ou de dados em selo de segurança.

### Fontes e metodologia

Organize como uma área de consulta, com índice por assunto, resumos curtos e aprofundamento por fonte ou método. Evite uma sequência extensa de tabelas, fórmulas e manifestos com o mesmo peso visual.

## Conteúdo que pode ser simplificado e conteúdo que deve permanecer

Remova introduções redundantes, repetições de instruções, etiquetas repetidas, explicações iguais em vários blocos e elementos decorativos sem função.

Consolide avisos que dizem a mesma coisa. Mantenha visíveis, junto ao resultado, as condições que mudam sua interpretação: período parcial, denominador incompatível ou defasado, ausência de dados, instabilidade e diferença entre comparação bruta e ajustada quando pertinente.

As distinções entre zero, indisponível e suprimido precisam continuar explícitas. Preserve fontes, unidades, período e natureza do evento. Detalhes podem mudar de posição ou profundidade; não podem desaparecer para deixar a tela aparentemente limpa.

## Escopo técnico e preservação das funcionalidades

Leia as instruções aplicáveis e o estado do Git. Preserve alterações existentes do usuário.

Refaça HTML, CSS e os templates gerados por JavaScript conforme necessário. A estrutura do conteúdo está principalmente em `assets/js/painel.js` e `assets/js/conteudo.js`; uma revisão apenas em `assets/css/styles.css` não atende ao pedido.

Preserve o mecanismo de seleção e as URLs compartilháveis em `assets/js/main.js`. Revise eventos, IDs e referências ao mover controles, para não deixar elementos duplicados, seletores quebrados ou buscas sem resposta.

Preserve cálculos, fontes, scripts de preparação, exportação, impressão, navegação pelo histórico, filtros, pesquisa CID, exploração do mapa e análises de fatores. Esta etapa não pede novas fontes ou reformulação epidemiológica.

Mantenha o frontend estático, sem impor backend, framework ou serviço pago para realizar o redesign. Atualize a versão dos assets quando necessário para evitar cache antigo após publicação.

## Processo e validação

1. Execute o site e registre capturas das telas atuais, incluindo entrada, mapa, análise municipal com fatores, catálogo e comparação.
2. Defina a hierarquia e os componentes compartilhados antes de polir cada página.
3. Implemente a nova estrutura em todas as áreas e estados relevantes, incluindo carregamento, erro, vazio, dado parcial e análise indisponível.
4. Compare capturas de antes e depois, usando as mesmas seleções. Inspecione pelo menos larguras de 390, 768 e 1440 pixels.
5. Valide o fluxo: buscar município → escolher doença → consultar resultado → investigar fatores → acessar melhorias e fontes → comparar → compartilhar/exportar.
6. Confira teclado, foco, contraste, rótulos, menus, expansões e retorno pelo histórico do navegador.

Não esconda problemas de layout com `overflow-x: hidden`. Corrija a causa; tabelas largas podem ter rolagem no próprio contêiner. Não reduza o corpo do texto para fazer excesso de conteúdo caber.

Se não houver acesso a navegador ou capturas, declare essa limitação e descreva as verificações efetivamente realizadas. Não afirme ter validado a aparência apenas por ler o código.

## Critérios de conclusão

- A entrada apresenta um ponto de partida claro e sem duplicação de buscas.
- O resultado principal da consulta é identificável antes dos detalhes técnicos.
- A barra de seleção não domina todas as telas.
- A navegação agrupa tarefas sem perder destinos ou links existentes.
- O resumo dos fatores é realmente resumido e leva ao conteúdo completo.
- Há redução perceptível de caixas aninhadas, selos, repetições e tabelas abertas sem necessidade.
- Alertas essenciais continuam próximos aos resultados afetados.
- Informações secundárias permanecem encontráveis por rótulos compreensíveis.
- O celular oferece uma experiência reorganizada, sem depender apenas de empilhar componentes do desktop.
- As funcionalidades aprovadas continuam operacionais e os resultados numéricos permanecem consistentes.
- As capturas demonstram uma mudança estrutural de design, com hierarquia, legibilidade e identidade coerentes.

Entregue o redesign implementado, explique brevemente as principais decisões e informe quais fluxos e tamanhos de tela foram validados. Não encerre apenas com um plano, um mockup ou uma troca de tema.

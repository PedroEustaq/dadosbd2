/* ============================================================
   Apresentação do projeto (rota #/projeto)
   ------------------------------------------------------------
   Uma página linear, na ordem do guia do trabalho:
   base → pipeline (Bronze/Prata/Ouro) → MySQL → EDA → dashboard.
   Os números vêm de dados/relatorios/apresentacao.json, gerado por
   scripts/montar_apresentacao.py.
   ============================================================ */

const PASSOS = [
  ["base", "Base"], ["pipeline", "Pipeline"], ["modelo", "MySQL"], ["eda", "Análise"], ["dashboard", "Dashboard"]
];

function mi(n){ // número curto, como se escreve no Brasil: 1,5 milhão; 4,8 milhões; 120 mil
  if(n >= 1e6){ const v = n / 1e6; return `${fmt1.format(v)} ${v < 2 ? "milhão" : "milhões"}`; }
  if(n >= 1e3) return `${fmtNum.format(Math.round(n / 1e3))} mil`;
  return fmtNum.format(n);
}

function barrasH(itens, { valor, rotulo, texto, destaque = () => false }){
  const max = Math.max(...itens.map(valor));
  return `<ol class="ap-barras">${itens.map(it => `
    <li class="${destaque(it) ? "on" : ""}">
      <span class="ap-barras-rot">${h(rotulo(it))}</span>
      <span class="ap-barras-trilho"><span style="width:${(valor(it) / max * 100).toFixed(1)}%"></span></span>
      <span class="ap-barras-val">${h(texto(it))}</span>
    </li>`).join("")}</ol>`;
}

function colunas(itens, { valor, rotulo, texto, destaque = () => false, tracejado = () => false }){
  const max = Math.max(...itens.map(valor));
  return `<div class="ap-colunas" style="--n:${itens.length}">${itens.map(it => `
    <div class="ap-col${destaque(it) ? " on" : ""}${tracejado(it) ? " parcial" : ""}" title="${h(rotulo(it))}: ${h(texto(it))}">
      <span class="ap-col-val">${h(texto(it))}</span>
      <span class="ap-col-barra" style="height:${(valor(it) / max * 100).toFixed(1)}%"></span>
      <span class="ap-col-rot">${h(rotulo(it))}</span>
    </div>`).join("")}</div>`;
}

function pergunta(n, titulo, resposta, grafico, nota){
  return cartao({ titulo:`${n}. ${titulo}`, nivel:3, classe:"ap-pergunta",
    corpo:`<p class="ap-resposta">${resposta}</p>${grafico}`, rodape: nota });
}

async function renderProjeto(el){
  el.innerHTML = carregandoHtml("Carregando a apresentação...");
  const d = await fetchJSON(`dados/relatorios/apresentacao.json?v=${DATA_VERSION}`);
  const v = d.volume;

  const p1 = d.p1_causas;
  // Média diária: meses têm tamanhos diferentes (fevereiro é menor)
  const p2 = d.p2_meses.map((x, i) => ({ ...x, dia: x.n / new Date(+d.ano, i + 1, 0).getDate() }));
  const picoMes = p2.reduce((a, b) => b.dia > a.dia ? b : a);
  const valeMes = p2.reduce((a, b) => b.dia < a.dia ? b : a);
  const NOME_MES = { jan:"janeiro", fev:"fevereiro", mar:"março", abr:"abril", mai:"maio", jun:"junho", jul:"julho", ago:"agosto", set:"setembro", out:"outubro", nov:"novembro", dez:"dezembro" };
  const ufs = d.p3_ufs;
  const p4 = d.p4_dengue;
  const d23 = p4.find(x => x.ano === "2023"), d24 = p4.find(x => x.ano === "2024");
  const p5 = d.p5_esgoto;
  const esgMelhor = p5[0], esgPior = p5[p5.length - 1];

  const etapa = (n, id, titulo, descricao, corpo, rodape = "") =>
    `<section id="ap-${id}" class="ap-etapa-sec" aria-labelledby="ap-${id}-t">
      <header class="ap-etapa-cab"><span class="ap-etapa-n" aria-hidden="true">${n}</span>
        <div><h2 id="ap-${id}-t">${titulo}</h2><p>${descricao}</p></div></header>
      ${corpo}
      ${rodape ? `<p class="ap-apoio">${rodape}</p>` : ""}
    </section>`;

  el.innerHTML = `
  ${cabecalhoPagina({ titulo:"Saúde no Território", contexto:"Projeto prático · Pipeline ETL e Engenharia de Dados",
    descricao:"Um município tem mais óbitos, internações ou casos de dengue do que o esperado para a sua população? E o que no território ajuda a explicar isso?",
    acoes:`<a class="btn" href="#/inicio">Consultar municípios</a>` })}
  <dl class="kpis ap-kpis">
    <div class="kpi"><dt class="kpi-rot">Óbitos</dt><dd class="kpi-valor">${mi(v.obitos)}</dd><dd class="kpi-nota">SIM · 2023–2026</dd></div>
    <div class="kpi"><dt class="kpi-rot">Internações no SUS</dt><dd class="kpi-valor">${mi(v.internacoes)}</dd><dd class="kpi-nota">SIH · 2023–2026</dd></div>
    <div class="kpi"><dt class="kpi-rot">Casos de dengue</dt><dd class="kpi-valor">${mi(v.dengue)}</dd><dd class="kpi-nota">SINAN · 2023–2026</dd></div>
    <div class="kpi"><dt class="kpi-rot">Municípios</dt><dd class="kpi-valor">${fmtNum.format(v.municipios)}</dd><dd class="kpi-nota">todo o Brasil</dd></div>
  </dl>

  <div class="grade grade-lateral grade-ap">
    <nav class="cartao painel-lateral indice ap-passos" aria-label="Etapas do projeto"><div class="cartao-corpo">
      ${PASSOS.map(([id, nome], i) => `<a href="#ap-${id}" data-passo="${id}"><b>${i + 1}</b> ${nome}</a>`).join("")}
    </div></nav>
    <div class="grade-col">

    ${etapa(1, "base", "Base de dados", "Cinco fontes públicas, ligadas pelo código IBGE do município.",
      cartao({ corpo: tabelaHtml([{ t:"Fonte" }, { t:"O que traz" }, { t:"Acesso" }], [
        ["<b>SIM</b>", "Óbitos por causa (CID-10), por município", "Ministério da Saúde, CSV"],
        ["<b>SIH/SUS</b>", "Internações no SUS por capítulo da CID-10", "DATASUS, TabNet"],
        ["<b>SINAN</b>", "Casos prováveis de dengue", "DATASUS, TabNet"],
        ["<b>IBGE</b>", "População, Censo 2022 e PIB dos municípios", "SIDRA e API de localidades"],
        ["<b>CNES e INPE</b>", "Estabelecimentos de saúde e focos de queimadas", "Dados abertos"]
      ]) }),
      `Chaves de ligação: <code>código IBGE do município</code> (7 dígitos) e <code>código CID-10</code>. Tempo: ano e mês.`)}

    ${etapa(2, "pipeline", "Pipeline ETL", "Arquitetura medalhão: do download ao banco de dados em três camadas.",
      `<ol class="ap-medalhao">
        <li class="cartao bronze"><div class="cartao-corpo"><h3>Bronze</h3><p>Downloads originais, sem alteração.</p><code>dados/brutos/</code></div>
          <footer class="cartao-rodape">cerca de 500 MB em CSV, ZIP e JSON</footer></li>
        <li class="cartao prata"><div class="cartao-corpo"><h3>Prata</h3><p>Limpeza de tipos, datas, códigos, duplicidades, nulos e outliers.</p><code>scripts/preparar_*.py</code></div>
          <footer class="cartao-rodape">${fmtNum.format(d.qualidade.invalidos)} valores inválidos · ${fmtNum.format(d.qualidade.sinalizados)} atípicos sinalizados</footer></li>
        <li class="cartao ouro"><div class="cartao-corpo"><h3>Ouro</h3><p>Agregados por município, ano e CID, carregados no MySQL.</p><code>scripts/importar_mysql.py</code></div>
          <footer class="cartao-rodape">${d.qualidade.verificacoes} verificações de totais · ${d.qualidade.aprovado ? "aprovadas" : "com falhas"}</footer></li>
      </ol>`,
      `Um comando refaz tudo: <code>python3 scripts/atualizar_tudo.py</code>. Nada é preenchido com zero ou média: o que falta aparece como “indisponível”.`)}

    ${etapa(3, "modelo", "Modelo no MySQL", "Esquema estrela: três tabelas fato ligadas às dimensões município, doença e tempo.",
      cartao({ corpo: `<div class="ap-estrela" role="img" aria-label="Diagrama: tabelas fato de óbitos, internações e dengue ligadas às dimensões município, UF, CID-10, população e indicadores.">
        <div class="ap-dim" style="grid-area:a"><b>uf</b><small>PK sigla</small></div>
        <div class="ap-dim" style="grid-area:b"><b>municipio</b><small>PK codigo · FK uf</small></div>
        <div class="ap-dim" style="grid-area:c"><b>cid_capitulo · grupo · categoria</b><small>PK código CID-10</small></div>
        <div class="ap-fatos" style="grid-area:f">
          <div class="ap-fato"><b>obito_municipio_cid</b><small>municipio · cid · ano → n</small></div>
          <div class="ap-fato"><b>internacao_municipio_capitulo</b><small>municipio · capitulo · ano → n</small></div>
          <div class="ap-fato"><b>dengue_municipio</b><small>municipio · ano → n</small></div>
        </div>
        <div class="ap-dim" style="grid-area:d"><b>populacao</b><small>municipio · ano → habitantes</small></div>
        <div class="ap-dim" style="grid-area:e"><b>indicador · indicador_valor</b><small>esgoto, renda, UBS, queimadas…</small></div>
      </div>` }),
      `19 tabelas e 2 visões em <code>sql/esquema.sql</code>, com PK, FK, NOT NULL e UNIQUE. Consultas de análise em <code>sql/consultas.sql</code>.`)}

    ${etapa(4, "eda", "Análise exploratória", "Cinco perguntas de negócio respondidas com os dados.",
      `<div class="ap-perguntas">
      ${pergunta(1, "Do que mais se morre no Brasil?",
        `<b>Doenças do coração e circulação</b>: ${fmt1.format(p1[0].pct)}% dos óbitos de ${d.ano}, seguidas de câncer (${fmt1.format(p1[1].pct)}%).`,
        barrasH(p1, { valor: x => x.n, rotulo: x => x.nome.replace(/\s*[\[(].*?[\])]/, "").replace(/^Doenças do aparelho /, "Ap. ").replace("Causas externas de morbidade e de mortalidade", "Causas externas").replace("Doenças endócrinas, nutricionais e metabólicas", "Endócrinas (diabetes)"), texto: x => `${fmt1.format(x.pct)}%`, destaque: x => x === p1[0] }),
        `Óbitos por capítulo da CID-10, Brasil, ${d.ano}. Fonte: SIM.`)}
      ${pergunta(2, "Existe época do ano com mais mortes?",
        `<b>Sim, entre maio e julho.</b> Em ${NOME_MES[picoMes.mes]} morreram ${fmtNum.format(Math.round(picoMes.dia))} pessoas por dia, ${fmt1.format((picoMes.dia / valeMes.dia - 1) * 100).replace(",0", "")}% a mais que em ${NOME_MES[valeMes.mes]}.`,
        colunas(p2, { valor: x => x.dia, rotulo: x => x.mes, texto: x => fmtNum.format(Math.round(x.dia)), destaque: x => x === picoMes }),
        `Média de óbitos por dia em cada mês, Brasil, ${d.ano}. Fonte: SIM.`)}
      ${pergunta(3, "Quais estados têm maior taxa de mortalidade?",
        `<b>${ufs[0].nome} e ${ufs[1].nome}</b> lideram, com ${fmt1.format(ufs[0].taxa)} e ${fmt1.format(ufs[1].taxa)} óbitos por 100 mil. ${ufs[ufs.length - 1].nome} tem a menor: ${fmt1.format(ufs[ufs.length - 1].taxa)}.`,
        barrasH([...ufs.slice(0, 5), ...ufs.slice(-3)], { valor: x => x.taxa, rotulo: x => x.nome, texto: x => fmt1.format(x.taxa), destaque: x => ufs.indexOf(x) < 2 }),
        `Taxa bruta por 100 mil habitantes, ${d.ano} (5 maiores e 3 menores). Estados com população mais velha têm taxa maior; no dashboard a comparação é ajustada por idade e sexo.`)}
      ${pergunta(4, "Como a dengue evoluiu?",
        `<b>${d24.ano} teve epidemia:</b> ${mi(d24.n)} de casos prováveis, ${fmtNum.format(Math.round(d24.n / d23.n))} vezes o número de ${d23.ano}.`,
        colunas(p4, { valor: x => x.n, rotulo: x => x.ano + (x.parcial ? "*" : ""), texto: x => mi(x.n), destaque: x => x === d24, tracejado: x => x.parcial }),
        `Casos prováveis de dengue, Brasil. * ano ainda em andamento ou com registros incompletos.`)}
      ${pergunta(5, "Saneamento tem relação com doenças infecciosas?",
        `<b>Sim.</b> Nos municípios com pior esgoto, a taxa de internação por doenças infecciosas é ${fmtNum.format(Math.round((esgPior.taxa / esgMelhor.taxa - 1) * 100))}% maior que nos de melhor esgoto.`,
        barrasH(p5, { valor: x => x.taxa, rotulo: x => x.faixa, texto: x => fmt1.format(x.taxa), destaque: x => x === esgPior }),
        `Internações no SUS por doenças infecciosas (cap. I) por 100 mil hab., ${d.ano}, municípios em quartis de esgoto precário (Censo 2022). Associação, não prova de causa.`)}
      </div>`)}

    ${etapa(5, "dashboard", "Dashboard", "Consulta de qualquer município, doença e ano, com o resultado em relação ao esperado e as melhorias.",
      cartao({ corpo: `<div class="ap-acoes">
        <a class="btn" href="#/inicio">Consultar municípios</a>
        <a class="btn-sec" href="#/municipio?m=3106200">Exemplo: Belo Horizonte</a>
        <a class="btn-sec" href="#/mapa">Mapa do Brasil</a>
        <a class="btn-sec" href="#/comparar?mc=doencas">Comparar doenças</a>
      </div>` }),
      `Limitações: 2025 e 2026 ainda são parciais; dados agregados mostram associação, não causa. Detalhes em <a href="#/fontes">Fontes e metodologia</a>.`)}

    </div>
  </div>`;

  // Destaca a etapa visível no índice fixo
  const links = el.querySelectorAll(".ap-passos a");
  links.forEach(a => a.addEventListener("click", ev => {
    ev.preventDefault();
    document.getElementById(a.getAttribute("href").slice(1))?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }));
  const obs = new IntersectionObserver(entradas => {
    entradas.forEach(e => {
      if(!e.isIntersecting) return;
      const id = e.target.id.replace("ap-", "");
      links.forEach(a => a.classList.toggle("on", a.dataset.passo === id));
    });
  }, { rootMargin: "-40% 0px -55% 0px" });
  PASSOS.forEach(([id]) => { const s = document.getElementById(`ap-${id}`); if(s) obs.observe(s); });
}

/* ============================================================
   Painel: componentes comuns e áreas Visão geral, Mapa,
   Meu município e Comparar locais
   ============================================================ */

/* ---------- Componentes ---------- */
/* Etiquetas que separam o tipo de informação em toda a interface. */
const ETIQUETAS = {
  fato: ["Fato observado", "Número registrado em uma fonte oficial para este local."],
  comparacao: ["Comparação", "Cálculo feito neste painel a partir dos números observados."],
  literatura: ["Informação geral", "Conhecimento descrito em fontes de referência. Não descreve este município."],
  associacao: ["Associação exploratória", "Relação estatística entre municípios. Não prova causa."],
  hipotese: ["Hipótese a investigar", "Possibilidade que os dados sugerem, mas não confirmam."]
};
function etiqueta(tipo){
  const [texto, dica] = ETIQUETAS[tipo];
  return `<span class="tag tag-${tipo}" title="${h(dica)}">${h(texto)}</span>`;
}

function tabelaHtml(colunas, linhas, { legenda = "", classe = "" } = {}){
  return `<div class="table-wrap"><table class="${classe}">
    ${legenda ? `<caption>${h(legenda)}</caption>` : ""}
    <thead><tr>${colunas.map(c => `<th scope="col"${c.num ? ' class="num"' : ""}>${h(c.t)}</th>`).join("")}</tr></thead>
    <tbody>${linhas.map(l => `<tr>${l.map((v, i) => `<td${colunas[i].num ? ' class="num"' : ""}>${v}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

function refsHtml(ids){
  const refs = base.conhecimento.referencias;
  return `<ul class="refs">${ids.filter(id => refs[id]).map(id =>
    `<li><a href="${h(urlSegura(refs[id].url))}" target="_blank" rel="noopener noreferrer">${h(refs[id].org)} — ${h(refs[id].titulo)}</a></li>`).join("")}</ul>`;
}

function termo(texto, explicacao){
  return `<details class="termo"><summary>${h(texto)}</summary><p>${h(explicacao)}</p></details>`;
}

const GLOSSARIO = {
  taxa: "Taxa = número de eventos dividido pela população e multiplicado por 100.000. Permite comparar lugares de tamanhos diferentes.",
  preliminar: "Dado preliminar (prévia): o Ministério da Saúde ainda está recebendo e revisando registros. Os números aumentam nas publicações seguintes, principalmente nos últimos meses.",
  ic: "Intervalo de 95%: faixa de valores compatíveis com o número observado, considerando a variação ao acaso. Com poucos eventos a faixa fica larga.",
  residencia: "Os eventos são contados no município onde a pessoa morava, não onde foi atendida ou morreu.",
  notificacao: "Notificação é o registro de um caso suspeito ou confirmado feito pelo serviço de saúde. Depende de a pessoa procurar atendimento e de o serviço registrar.",
  padronizacao: "Padronização por idade: calcula quantos eventos seriam esperados se cada faixa de idade e sexo do município tivesse a mesma taxa da UF. Evita que um município pareça pior apenas por ter mais idosos."
};

/* Avisos sobre o período e a natureza do dado. */
function avisosPeriodo(evento, ano){
  const info = infoAno(evento, ano);
  if(!info) return "";
  const itens = [];
  if(!info.ano_completo) itens.push(`<strong>Período parcial:</strong> ${h(info.periodo)}. Os totais não foram projetados para o ano inteiro e não devem ser comparados com anos completos.`);
  if(evento === "obitos") itens.push(`${h(info.situacao || "")} Publicado em ${h(formatarData(info.publicado_em))}.`);
  if(evento === "internacoes") itens.push("Somente internações pagas pelo SUS; uma mesma pessoa pode ter mais de uma internação.");
  if(evento === "dengue") itens.push("Casos prováveis notificados; não é o número real de infecções.");
  return `<ul class="avisos">${itens.map(i => `<li>${i}</li>`).join("")}</ul>`;
}

function formatarData(iso){
  if(!iso) return "data não informada";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function rotuloPeriodo(evento, ano){
  const info = infoAno(evento, ano);
  return info ? `${ano} (${info.periodo})` : ano;
}

function linhaFonte(evento, ano){
  const ev = EVENTOS[evento];
  return `<p class="fonte">Fonte: ${h(ev.fonte)} · ${h(rotuloPeriodo(evento, ano))} · por município de residência · <a href="#/fontes">como ler estes dados</a></p>`;
}

function intervaloTexto(c){
  return c?.ic ? `${fmt2.format(c.razao)} (intervalo de 95%: ${fmt2.format(c.ic[0])} a ${fmt2.format(c.ic[1])})` : "—";
}

function seloComparacao(c){
  if(!c || c.classe === "indisponivel") return `<span class="selo selo-neutro">sem base para comparar</span>`;
  const simbolo = { acima:"▲", abaixo:"▼", compativel:"●" }[c.classe];
  return `<span class="selo selo-${c.classe}"><span aria-hidden="true">${simbolo}</span> ${h(c.rotulo)}</span>`;
}

function erroHtml(erro){
  console.error(erro);
  return `<div class="card estado-erro" role="alert"><h2>Não foi possível carregar estes dados</h2>
    <p>${h(erro?.message || erro)}</p><p>Verifique a conexão e tente de novo. As outras áreas do painel continuam disponíveis.</p>
    <button class="btn" type="button" onclick="renderizar()">Tentar novamente</button></div>`;
}

const carregandoHtml = texto => `<div class="card estado-carregando" role="status"><span class="spinner" aria-hidden="true"></span> ${h(texto)}</div>`;

/* ============================================================
   Visão geral
   ============================================================ */
async function renderInicio(el){
  const anoSim = anosDe("obitos").filter(a => infoAno("obitos", a).ano_completo).slice(-1)[0];
  const anoSih = anosDe("internacoes").filter(a => infoAno("internacoes", a).ano_completo).slice(-1)[0];
  const anoDen = anosDe("dengue").slice(-2)[0];
  const sim = infoAno("obitos", anoSim), sih = infoAno("internacoes", anoSih), den = infoAno("dengue", anoDen);
  const meta = base.cid.meta.totais;
  const dic = base.dicionario;
  el.innerHTML = `
    <div class="hero card">
      <h1 id="t-inicio">O que os dados públicos mostram sobre a saúde no seu município?</h1>
      <p class="lead">Escolha um município e uma doença para ver quantos registros existem, se a taxa é alta em relação à população e a lugares parecidos, e quais condições do território merecem ser investigadas.</p>
      <div class="hero-busca">
        <div class="field combo">
          <label for="heroMun">Comece pelo município</label>
          <input id="heroMun" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="heroMunLista" autocomplete="off" placeholder="Digite o nome do município" />
          <ul id="heroMunLista" class="combo-list" role="listbox" aria-label="Municípios encontrados" hidden></ul>
        </div>
        <div class="field combo">
          <label for="heroCausa">ou por uma doença</label>
          <input id="heroCausa" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="heroCausaLista" autocomplete="off" placeholder="Ex.: infarto, dengue, câncer de mama, J18" />
          <ul id="heroCausaLista" class="combo-list" role="listbox" aria-label="Doenças encontradas" hidden></ul>
        </div>
      </div>
      <p class="hint">Não é preciso cadastro nem conhecer os códigos da CID.</p>
    </div>

    <div class="grid-3">
      <a class="card card-link" href="#/municipio"><h2>Meu município</h2><p>Doenças com mais registros, taxas, comparação com o estado e o Brasil, evolução e fatores a investigar.</p></a>
      <a class="card card-link" href="#/mapa"><h2>Explorar o mapa</h2><p>Taxas por estado e por município para a doença, o tipo de evento e o período escolhidos.</p></a>
      <a class="card card-link" href="#/doencas"><h2>Doenças e CID</h2><p>Catálogo completo da CID-10: ${fmtNum.format(meta.categorias)} categorias e ${fmtNum.format(meta.subcategorias)} subcategorias, com os dados disponíveis para cada uma.</p></a>
      <a class="card card-link" href="#/comparar"><h2>Comparar locais</h2><p>Coloque municípios e estados lado a lado, com a mesma medida e o mesmo período.</p></a>
      <a class="card card-link" href="#/fatores"><h2>Fatores e melhorias</h2><p>Saneamento, renda, acesso à saúde, queimadas e outros indicadores do território, com as ações que têm respaldo em fontes confiáveis.</p></a>
      <a class="card card-link" href="#/fontes"><h2>Fontes e metodologia</h2><p>De onde vem cada número, como as taxas são calculadas e o que os dados não permitem concluir.</p></a>
    </div>

    <div class="card">
      <h2>O que está disponível</h2>
      ${tabelaHtml(
        [{ t:"Tipo de evento" }, { t:"Fonte" }, { t:"Períodos" }, { t:"Detalhe por doença" }, { t:`Exemplo (Brasil)`, num:true }],
        [
          ["Óbitos", "SIM / Ministério da Saúde", anosDe("obitos").map(a => h(rotuloPeriodo("obitos", a))).join("<br>"), "Qualquer capítulo, grupo ou categoria da CID-10 (subcategoria por UF)", `${fmtNum.format(sim.obitos)} em ${anoSim}`],
          ["Internações no SUS", "SIH/SUS / DATASUS", anosDe("internacoes").map(a => h(rotuloPeriodo("internacoes", a))).join("<br>"), "Capítulo da CID-10", `${fmtNum.format(sih.internacoes)} em ${anoSih}`],
          ["Notificações de dengue", "SINAN / Ministério da Saúde", anosDe("dengue").join(", "), "Somente dengue", `${fmtNum.format(den.casos_provaveis)} casos prováveis em ${anoDen}`]
        ], { legenda:"Tipos de evento de saúde integrados. Cada um vem de um sistema diferente e não deve ser somado aos outros." })}
      <p>Indicadores do território: <strong>${dic.indicadores.length}</strong> indicadores municipais em ${dic.dimensoes.length} dimensões (${dic.dimensoes.map(h).join(", ")}).
      Algumas dimensões ainda não têm dados municipais integrados — veja o que falta em <a href="#/fatores">Fatores e melhorias</a>.</p>
    </div>

    <div class="card">
      <h2>Como usar</h2>
      <ol class="passos">
        <li><strong>Escolha o município</strong> na barra de seleção, no alto da página.</li>
        <li><strong>Escolha a doença ou o grupo</strong> — pelo nome comum ou pelo código.</li>
        <li><strong>Escolha o tipo de evento e o período</strong>: óbitos, internações no SUS ou notificações.</li>
        <li><strong>Veja os indicadores</strong>: número de registros, população, taxa e comparação.</li>
        <li><strong>Entenda os fatores relacionados</strong> e o que os dados locais mostram sobre eles.</li>
        <li><strong>Consulte melhorias e fontes</strong> que sustentam cada informação.</li>
      </ol>
      <p class="nota"><strong>Importante:</strong> este painel ajuda a investigar; ele não explica a causa de cada doença em cada lugar. Onde os dados não bastam, isso é dito claramente.</p>
    </div>`;
  criarCombobox($("heroMun"), $("heroMunLista"), opcoesMunicipio, item => navegar({ rota:"municipio", mun:item.valor }));
  criarCombobox($("heroCausa"), $("heroCausaLista"), opcoesCausa, item => navegar({ rota: sel.mun ? "municipio" : "mapa", causa:item.valor }));
}

/* ============================================================
   Explorar o mapa
   ============================================================ */
async function renderMapa(_el, token){
  const causa = lerCausa(sel.causa);
  const disp = disponibilidade(sel.evento, causa);
  const ev = EVENTOS[sel.evento];
  const focus = $("mapFocusSel");
  if(!focus.options.length){
    focus.innerHTML = '<option value="">Brasil (estados)</option>' + ALL_UFS.sort((a, b) => ptCollator.compare(UF_NAMES[a], UF_NAMES[b]))
      .map(uf => `<option value="${uf}">${h(UF_NAMES[uf])} (municípios)</option>`).join("");
  }
  $("mapSub").innerHTML = `${h(ev.taxa)} por 100 mil habitantes · <strong>${h(sel.evento === "dengue" ? "Dengue" : causa.rotulo)}</strong> · ${h(rotuloPeriodo(sel.evento, sel.ano))}`;
  $("mapLegend").innerHTML = legendaMapaHtml();
  const aviso = $("mapAviso");
  aviso.innerHTML = "";
  if(sel.sexo || sel.idade) aviso.innerHTML += `<p class="nota">O mapa não aplica os filtros de sexo e idade: mostra a população total.</p>`;
  if(!disp.ok || !infoAno(sel.evento, sel.ano)){
    aviso.innerHTML += indisponivelHtml(disp, causa);
    $("mapTabela").innerHTML = "";
    await carregarMapa();
    mapa.consulta = null; mapa.ufs = new Map(); mapa.municipios = new Map(); mapa.taxaBR = null;
    restyleMap();
    return;
  }
  aviso.innerHTML += avisosPeriodo(sel.evento, sel.ano);
  await carregarMapa();
  if(mapa.erro) aviso.innerHTML += `<p class="nota nota-erro" role="alert">${h(mapa.erro)}</p>`;
  const atual = await atualizarDadosMapa({ causa, evento: sel.evento, ano: sel.ano });
  if(!atual || token !== renderToken) return;
  if(map) setTimeout(() => map.invalidateSize(), 0);
  const ufMun = sel.mun ? ufDe(sel.mun) : "";
  if(map && ufMun && !mapa.focoUF && !mapa._focoInicial){ mapa._focoInicial = true; setMapView(ufMun); }
  await renderTabelaMapa(token);
}

function indisponivelHtml(disp, causa){
  const alternativa = disp.alternativa
    ? ` <a href="${h(linkPara({ causa: disp.alternativa }))}">Ver ${h(lerCausa(disp.alternativa).rotulo)}</a> ou <a href="${h(linkPara({ evento:"obitos" }))}">ver óbitos de ${h(causa.curto)}</a>.` : "";
  return `<div class="nota nota-indisponivel" role="status"><strong>Dado indisponível para esta combinação.</strong> ${h(disp.motivo || `Não há dados de ${EVENTOS[sel.evento].plural} para ${sel.ano}.`)}${alternativa}
    <br>Isso não significa zero casos: significa que esta fonte não traz a informação.</div>`;
}

async function renderTabelaMapa(token = renderToken){
  if(!mapa.consulta || sel.rota !== "mapa") return;
  const el = $("mapTabela");
  const ev = EVENTOS[mapa.consulta.evento];
  const foco = mapa.focoUF;
  let linhas, titulo;
  if(foco){
    try{ await carregarDadosMunicipais(foco); }catch(erro){ el.innerHTML = erroHtml(erro); return; }
    if(token !== renderToken) return;
    linhas = [...mapa.municipios.values()].filter(m => m.uf === foco).map(m => ({ nome:m.nome, codigo:m.c, ...m }));
    titulo = `Municípios de ${UF_NAMES[foco]}`;
  }else{
    linhas = ALL_UFS.map(uf => ({ nome: UF_NAMES[uf], codigo: uf, ...mapa.ufs.get(uf) }));
    titulo = "Estados";
  }
  linhas.sort((a, b) => (b.taxa ?? -1) - (a.taxa ?? -1));
  const mostrar = foco ? linhas.slice(0, mapa._tabelaTudo ? linhas.length : 30) : linhas;
  const classe = item => {
    const m = medidaMapa(item);
    return m.estado === "ok" ? MAP_CLASSES[m.classe].rotulo : (m.estado === "instavel" ? "poucos eventos: taxa instável" : "sem dado");
  };
  el.innerHTML = `
    <div class="card-head"><div><h2>${h(titulo)} — tabela do mapa</h2>
      <p class="sub">Ordenada pela taxa (não pelo total, que acompanha o tamanho da população). Brasil: ${fmtValor(mapa.taxaBR)} por 100 mil.</p></div>
      <button id="mapCsv" class="btn ghost" type="button">Exportar CSV</button></div>
    ${tabelaHtml(
      [{ t: foco ? "Município" : "Estado" }, { t: ev.rotulo, num:true }, { t:"População", num:true }, { t:"Taxa por 100 mil", num:true }, { t:"Em relação ao Brasil" }],
      mostrar.map(l => [
        foco ? `<a href="${h(linkPara({ rota:"municipio", mun:l.codigo }))}">${h(l.nome)}</a>` : `<button class="link-button" type="button" data-foco="${l.codigo}">${h(l.nome)}</button>`,
        l.n == null ? "—" : fmtNum.format(l.n), l.pop == null ? "sem população" : fmtNum.format(l.pop), fmtValor(l.taxa), h(classe(l))
      ]), { legenda:`${ev.taxa} — ${mapa.consulta.evento === "dengue" ? "dengue" : mapa.consulta.causa.rotulo} — ${rotuloPeriodo(mapa.consulta.evento, mapa.consulta.ano)}` })}
    ${foco && linhas.length > mostrar.length ? `<button id="mapMais" class="btn ghost" type="button">Mostrar os ${linhas.length} municípios</button>` : ""}
    ${linhaFonte(mapa.consulta.evento, mapa.consulta.ano)}`;
  el.querySelectorAll("[data-foco]").forEach(b => b.addEventListener("click", () => setMapView(b.dataset.foco)));
  $("mapMais")?.addEventListener("click", () => { mapa._tabelaTudo = true; renderTabelaMapa(); });
  $("mapCsv").addEventListener("click", () => baixarCSV(`mapa_${mapa.consulta.evento}_${mapa.consulta.ano}.csv`,
    [["local", "codigo", "eventos", "populacao", "taxa_por_100mil", "em_relacao_ao_brasil"],
      ...linhas.map(l => [l.nome, l.codigo, l.n ?? "", l.pop ?? "", l.taxa == null ? "" : l.taxa.toFixed(2), classe(l)])],
    notasExportacao(mapa.consulta.evento, mapa.consulta.causa, mapa.consulta.ano)));
}
document.addEventListener("mapa:nivel", () => { mapa._tabelaTudo = false; renderTabelaMapa(); });

function notasExportacao(evento, causa, ano){
  const ev = EVENTOS[evento];
  return [
    `Evento: ${ev.rotulo} (${ev.fonte})`,
    `Causa: ${evento === "dengue" ? "Dengue (CID-10 A90, A91, A97)" : causa.rotulo}`,
    `Período: ${rotuloPeriodo(evento, ano)} — anos parciais não são anualizados`,
    `Unidade da taxa: eventos por 100.000 habitantes; população: ${popDe("BR", ano)?.origem || "IBGE"}`,
    "Contagem por município de residência. Dados agregados; valores podem mudar em novas publicações.",
    `Gerado em ${new Date().toLocaleDateString("pt-BR")} — dados versão ${DATA_VERSION} — ${location.href}`
  ];
}

/* ============================================================
   Meu município
   ============================================================ */
let nivelCausas = "capitulo";

async function renderMunicipio(el, token){
  if(!sel.mun || !base.munPorCodigo.has(sel.mun)){
    el.innerHTML = `<div class="card vazio"><h1>Meu município</h1>
      <p>Digite o nome do município no campo <strong>Município</strong>, no alto da página, para ver as doenças com mais registros, as taxas e os fatores a investigar.</p>
      <p><button class="btn" type="button" onclick="$('munInput').focus()">Escolher município</button></p></div>`;
    return;
  }
  const m = base.munPorCodigo.get(sel.mun);
  const causa = lerCausa(sel.causa);
  const ev = EVENTOS[sel.evento];
  const populacao = popDe(sel.mun, sel.ano) || popDe(sel.mun, "2025");
  const opcoes = { causa, evento: sel.evento, ano: sel.ano, sexo: sel.sexo, idade: sel.idade };
  el.innerHTML = `
    <div class="card cabecalho-local">
      <div>
        <h1>${h(m.n)} <small>${h(UF_NAMES[m.uf])}</small></h1>
        <p class="sub">Código IBGE ${h(m.c)} · ${populacao ? `${fmtNum.format(populacao.valor)} habitantes (${h(populacao.origem)}) · porte: ${h(PORTES[porteDe(populacao.valor)].rotulo)}` : "população não disponível para este município"}</p>
      </div>
      <div class="acoes no-print">
        <button id="imprimirBtn" class="btn ghost" type="button">Imprimir relatório</button>
        <button id="csvBtn" class="btn ghost" type="button">Exportar CSV</button>
      </div>
    </div>
    <div id="munResultado">${carregandoHtml("Calculando os indicadores do município...")}</div>
    <div id="munSerie"></div>
    <div id="munCausas"></div>
    <div id="munFatores"></div>`;
  $("imprimirBtn").addEventListener("click", () => window.print());

  let analise, serie, comp;
  try{
    [analise, serie] = await Promise.all([analisar(sel.mun, opcoes), serieAnual(sel.mun, opcoes)]);
    comp = analise.disponivel && !sel.sexo && !sel.idade ? await comparaveis(sel.mun, causa, sel.evento, sel.ano) : null;
  }catch(erro){
    if(token === renderToken) $("munResultado").innerHTML = erroHtml(erro);
    return;
  }
  if(token !== renderToken) return;
  $("munResultado").innerHTML = resultadoHtml(analise, comp);
  $("munSerie").innerHTML = serieHtml(serie, opcoes);
  $("csvBtn").addEventListener("click", () => exportarMunicipio(analise, serie));

  renderCausasMunicipio(token);
  try{
    $("munFatores").innerHTML = await fatoresHtml(sel.mun, causa, sel.evento, sel.ano, { resumo:true });
    ligarFatores($("munFatores"));
  }catch(erro){ $("munFatores").innerHTML = erroHtml(erro); }
}

function resultadoHtml(a, comp){
  const ev = EVENTOS[a.evento];
  const titulo = a.evento === "dengue" ? "Dengue (casos prováveis notificados)" : a.causa.rotulo;
  const natureza = a.causa.natureza && a.causa.natureza !== "doença" && a.evento !== "dengue"
    ? `<p class="nota">Este item da CID não é propriamente uma doença: ${h(a.causa.natureza)}.</p>` : "";
  const recorte = [a.sexo ? (a.sexo === "F" ? "sexo feminino" : "sexo masculino") : "", a.idade ? GRUPOS_IDADE[a.idade].rotulo : ""].filter(Boolean).join(", ");
  const cab = `<h2>${h(titulo)}</h2><p class="sub">${h(ev.rotulo)} · ${h(rotuloPeriodo(a.evento, a.ano))}${recorte ? ` · ${h(recorte)}` : ""}</p>${natureza}`;
  if(!a.disponivel) return `<div class="card">${cab}${indisponivelHtml(a, a.causa)}</div>`;

  const semPop = !a.pop;
  const kpis = `<div class="kpis">
      <div class="kpi"><span class="kpi-label">${h(ev.rotulo)} ${etiqueta("fato")}</span><strong>${fmtNum.format(a.n)}</strong><small>numerador</small></div>
      <div class="kpi"><span class="kpi-label">População ${etiqueta("fato")}</span><strong>${semPop ? "—" : fmtNum.format(a.pop.valor)}</strong><small>${semPop ? "denominador indisponível" : `denominador · ${h(a.pop.origem)}`}</small></div>
      <div class="kpi"><span class="kpi-label">${h(ev.taxa)} ${etiqueta("comparacao")}</span><strong>${semPop ? "—" : fmtValor(a.taxa)}</strong><small>por 100 mil habitantes</small></div>
    </div>`;
  const avisos = [];
  if(semPop) avisos.push("Não há população publicada para este município neste ano; por isso a taxa não foi calculada.");
  if(a.pop?.defasado) avisos.push(`A população usada é de ${h(a.pop.ano)} e os eventos são de ${h(a.ano)}: há defasagem entre numerador e denominador.`);
  if(a.n === 0) avisos.push("Nenhum registro no arquivo publicado. Isso não prova ausência da doença: pode haver sub-registro, registro com outra causa ou, em dados preliminares, informações ainda não enviadas.");

  let veredito = "";
  const c = a.comparacao;
  if(c && c.classe !== "indisponivel"){
    const ref = a.referencia;
    veredito = `<div class="veredito veredito-${c.classe}">
      <p class="veredito-titulo">${seloComparacao(c)} <span>em relação a ${h(nomeLocal(ref.local))}</span> ${etiqueta("comparacao")}</p>
      <p>Foram registrados <strong>${fmtNum.format(a.n)}</strong> ${h(plural(a.n, ev.singular, ev.plural))}. Com a taxa de ${h(nomeLocal(ref.local))} (${fmtValor(ref.taxa)} por 100 mil), seriam esperados cerca de <strong>${fmtValor(a.esperado)}</strong>.
      Razão entre observado e esperado: <strong>${intervaloTexto(c)}</strong>.</p>
      ${c.poucos ? `<p class="nota">Menos de 10 eventos: a comparação é instável e um único registro muda bastante o resultado.</p>` : ""}
      ${a.padronizado ? `<p><strong>Levando em conta a idade e o sexo da população</strong> (padronização indireta, Censo 2022): esperados ${fmtValor(a.padronizado.esperado)}; razão ${intervaloTexto(a.padronizado)} — ${seloComparacao(a.padronizado)}.
        ${a.padronizado.classe !== c.classe ? "A conclusão muda quando se considera a estrutura etária: prefira esta comparação." : ""}</p>`
        : (ehMunicipio(a.local) && !a.sexo && !a.idade ? `<p class="nota">Comparação bruta, sem ajuste por idade: para ${a.evento === "obitos" ? "grupos e códigos específicos" : "este tipo de evento"} não há contagem municipal por idade. Municípios com mais idosos tendem a ter taxas brutas maiores.</p>` : "")}
      ${termo("Como este critério funciona", "O resultado é “acima” ou “abaixo” apenas quando todo o intervalo de 95% da razão observado/esperado fica acima ou abaixo de 1. Caso contrário, a diferença pode ser fruto do acaso. " + GLOSSARIO.ic + " " + GLOSSARIO.padronizacao)}
    </div>`;
  }
  const refs = [a, ...(a.refs || [])];
  const tabela = tabelaHtml(
    [{ t:"Local" }, { t: ev.rotulo, num:true }, { t:"População", num:true }, { t:"Taxa por 100 mil", num:true }],
    refs.map(r => [h(nomeLocal(r.local)), fmtNum.format(r.n), r.pop ? fmtNum.format(r.pop.valor) : "—", fmtValor(r.taxa)]),
    { legenda:"Numerador, denominador e taxa do município e das referências, no mesmo período e com os mesmos filtros" });
  let comparaveisHtml = "";
  if(comp){
    comparaveisHtml = comp.suficiente
      ? `<p>${etiqueta("comparacao")} Entre os <strong>${comp.n}</strong> municípios de ${h(UF_NAMES[ufDe(a.local)])} com ${h(comp.porte)}, a taxa mediana é ${fmtValor(comp.mediana)} (metade deles fica entre ${fmtValor(comp.p25)} e ${fmtValor(comp.p75)}).
        Este município está acima de cerca de <strong>${Math.round(comp.percentil)}%</strong> deles. A posição é relativa e não indica, sozinha, risco aumentado.</p>`
      : `<p class="nota">Há apenas ${comp.n} municípios de mesmo porte em ${h(UF_NAMES[ufDe(a.local)])}: poucos para uma comparação entre municípios parecidos.</p>`;
  }
  return `<div class="card">${cab}${kpis}
    ${avisos.length ? `<ul class="avisos">${avisos.map(x => `<li>${x}</li>`).join("")}</ul>` : ""}
    ${veredito}${tabela}${comparaveisHtml}
    ${avisosPeriodo(a.evento, a.ano)}
    <div class="termos">${termo("O que é taxa?", GLOSSARIO.taxa)}${termo("Por que município de residência?", GLOSSARIO.residencia)}${a.evento === "dengue" ? termo("O que é notificação?", GLOSSARIO.notificacao) : termo("O que é dado preliminar?", GLOSSARIO.preliminar)}</div>
    ${linhaFonte(a.evento, a.ano)}</div>`;
}

function serieHtml(serie, opcoes){
  const ev = EVENTOS[opcoes.evento];
  const validos = serie.filter(s => s.disponivel && s.taxa != null);
  if(!validos.length) return "";
  const maximo = Math.max(...validos.map(s => s.taxa), 0.0001);
  const algumParcial = serie.some(s => s.info && !s.info.ano_completo);
  return `<div class="card"><h2>Evolução por ano</h2>
    <div class="table-wrap"><table>
      <caption>${h(ev.rotulo)} e taxa por 100 mil habitantes em cada período disponível</caption>
      <thead><tr><th scope="col">Ano</th><th scope="col">Período coberto</th><th scope="col" class="num">${h(ev.rotulo)}</th><th scope="col" class="num">População</th><th scope="col" class="num">Taxa</th><th scope="col">Gráfico da taxa</th></tr></thead>
      <tbody>${serie.map(s => {
        if(!s.disponivel) return `<tr><td>${h(s.ano)}</td><td colspan="5">indisponível</td></tr>`;
        const parcial = !s.info.ano_completo;
        return `<tr${s.ano === sel.ano ? ' class="linha-atual"' : ""}><td><a href="${h(linkPara({ ano: s.ano }))}">${h(s.ano)}</a></td>
          <td>${h(s.info.periodo)}${parcial ? ' <span class="selo selo-neutro">parcial</span>' : ""}</td>
          <td class="num">${fmtNum.format(s.n)}</td><td class="num">${s.pop ? fmtNum.format(s.pop.valor) + (s.pop.defasado ? ` <small>(${h(s.pop.ano)})</small>` : "") : "—"}</td><td class="num">${fmtValor(s.taxa)}</td>
          <td><span class="barra${parcial ? " barra-parcial" : ""}" style="width:${s.taxa == null ? 0 : Math.max(2, 100 * s.taxa / maximo)}%"></span></td></tr>`;
      }).join("")}</tbody></table></div>
    ${serie.some(s => s.pop?.defasado) ? `<p class="nota">População com o ano entre parênteses: não há estimativa oficial para o ano dos eventos; foi usado o Censo indicado.</p>` : ""}
    ${algumParcial ? `<p class="nota">Barras listradas são períodos parciais: a taxa é menor porque cobre menos meses, não porque houve queda. Compare apenas períodos equivalentes.</p>` : ""}
  </div>`;
}

async function renderCausasMunicipio(token = renderToken){
  const el = $("munCausas");
  if(!el) return;
  const ev = EVENTOS[sel.evento];
  if(sel.evento === "dengue"){ el.innerHTML = ""; return; }
  const niveis = sel.evento === "obitos" ? [["capitulo", "Capítulos"], ["grupo", "Grupos"], ["categoria", "Doenças (categorias)"]] : [["capitulo", "Capítulos"]];
  if(!niveis.some(n => n[0] === nivelCausas)) nivelCausas = "capitulo";
  let itens;
  try{ itens = await principaisCausas(sel.mun, sel.evento, sel.ano, nivelCausas); }
  catch(erro){ el.innerHTML = erroHtml(erro); return; }
  if(token !== renderToken) return;
  el.innerHTML = `<div class="card">
    <div class="card-head"><div><h2>O que tem mais registros neste município</h2>
      <p class="sub">${h(ev.rotulo)} · ${h(rotuloPeriodo(sel.evento, sel.ano))} · clique em uma linha para analisar</p></div>
      <div class="abas no-print" role="group" aria-label="Nível de detalhe">${niveis.map(([id, t]) => `<button type="button" class="aba${id === nivelCausas ? " ativa" : ""}" aria-pressed="${id === nivelCausas}" data-nivel="${id}">${h(t)}</button>`).join("")}</div>
    </div>
    ${itens.length ? tabelaHtml(
      [{ t:"Causa (CID-10)" }, { t: ev.rotulo, num:true }, { t:"Participação", num:true }, { t:"Taxa por 100 mil", num:true }, { t:`Comparação com ${ufDe(sel.mun)}` }],
      itens.map(i => [
        `<a href="${h(linkPara({ causa: i.causa.id }))}">${h(i.causa.rotulo)}</a>`,
        fmtNum.format(i.n), i.participacao == null ? "—" : fmtPct.format(i.participacao), fmtValor(i.taxa), seloComparacao(i.comparacao)
      ]), { legenda:`${itens.length} causas com mais registros` })
      : `<p class="nota">Nenhum registro neste período no arquivo publicado. Ausência de registro não é o mesmo que ausência de doença.</p>`}
    <p class="nota">“Participação” é a parte de cada causa no total de ${h(ev.plural)} ${nivelCausas === "capitulo" ? "do município" : "das causas listáveis neste nível"} no período. Não é taxa por população.
    ${nivelCausas === "capitulo" && sel.evento === "obitos" ? "Capítulos como “causas externas” e “sintomas e causas mal definidas” não são doenças." : ""}</p>
  </div>`;
  el.querySelectorAll("[data-nivel]").forEach(b => b.addEventListener("click", () => { nivelCausas = b.dataset.nivel; renderCausasMunicipio(); }));
}

function exportarMunicipio(analise, serie){
  const linhas = [["local", "codigo_ibge", "evento", "causa", "ano", "periodo", "eventos", "populacao", "populacao_referencia", "taxa_por_100mil", "situacao"]];
  const ev = EVENTOS[analise.evento];
  const causa = analise.evento === "dengue" ? "Dengue (A90, A91, A97)" : analise.causa.rotulo;
  for(const s of serie){
    for(const r of s.disponivel ? [s, ...(s.refs || [])] : []){
      linhas.push([nomeLocal(r.local), ehMunicipio(r.local) ? r.local : "", ev.rotulo, causa, s.ano, s.info.periodo, r.n, r.pop?.valor ?? "", r.pop?.origem ?? "sem população",
        r.taxa == null ? "" : r.taxa.toFixed(2), s.info.ano_completo ? "ano completo" : "período parcial"]);
    }
  }
  baixarCSV(`${normText(base.munPorCodigo.get(analise.local).n).replace(/ /g, "_")}_${analise.evento}.csv`, linhas, [
    ...notasExportacao(analise.evento, analise.causa, analise.ano),
    analise.sexo || analise.idade ? `Recorte: sexo ${analise.sexo || "todos"}, idade ${GRUPOS_IDADE[analise.idade].rotulo}` : "Recorte: todos os sexos e idades"
  ]);
}

/* ============================================================
   Comparar locais
   ============================================================ */
async function renderComparar(el, token){
  const causa = lerCausa(sel.causa);
  const ev = EVENTOS[sel.evento];
  const locais = sel.comparar.filter(l => UF_NAMES[l] || base.munPorCodigo.has(l));
  el.innerHTML = `<div class="card">
      <h1>Comparar locais</h1>
      <p class="sub">${h(ev.taxa)} · <strong>${h(sel.evento === "dengue" ? "Dengue" : causa.rotulo)}</strong> · ${h(rotuloPeriodo(sel.evento, sel.ano))}</p>
      <p>Todos os locais usam a mesma medida, o mesmo período e os mesmos filtros da barra de seleção. Adicione até 6 municípios ou estados.</p>
      <div class="sel-fields no-print">
        <div class="field combo"><label for="cmpMun">Adicionar município</label>
          <input id="cmpMun" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="cmpMunLista" autocomplete="off" placeholder="Nome do município" />
          <ul id="cmpMunLista" class="combo-list" role="listbox" hidden></ul></div>
        <div class="field"><label for="cmpUF">Adicionar estado</label>
          <select id="cmpUF"><option value="">Escolha…</option>${ALL_UFS.sort((a, b) => ptCollator.compare(UF_NAMES[a], UF_NAMES[b])).map(uf => `<option value="${uf}">${h(UF_NAMES[uf])}</option>`).join("")}</select></div>
      </div>
      <div class="chips">${locais.map(l => `<button class="chip" type="button" data-remover="${h(l)}" aria-label="Remover ${h(nomeLocal(l))} da comparação">${h(nomeLocal(l))} <span aria-hidden="true">×</span></button>`).join("")}</div>
    </div><div id="cmpResultado"></div>`;
  const adicionar = local => { if(local && !sel.comparar.includes(local) && sel.comparar.length < 6) navegar({ comparar: [...sel.comparar, local] }); };
  criarCombobox($("cmpMun"), $("cmpMunLista"), opcoesMunicipio, item => adicionar(item.valor), { limparAoEscolher:true });
  $("cmpUF").addEventListener("change", e => adicionar(e.target.value));
  el.querySelectorAll("[data-remover]").forEach(b => b.addEventListener("click", () => navegar({ comparar: sel.comparar.filter(l => l !== b.dataset.remover) })));

  const saida = $("cmpResultado");
  if(!locais.length){
    saida.innerHTML = `<div class="card vazio"><p>Adicione locais acima para comparar.${sel.mun ? ` <button class="btn ghost" type="button" id="cmpSugestao">Começar com ${h(nomeLocal(sel.mun))} e ${h(UF_NAMES[ufDe(sel.mun)])}</button>` : ""}</p></div>`;
    $("cmpSugestao")?.addEventListener("click", () => navegar({ comparar: [sel.mun, ufDe(sel.mun)] }));
    return;
  }
  saida.innerHTML = carregandoHtml("Calculando a comparação...");
  let analises;
  try{
    analises = await Promise.all([...locais, "BR"].map(l => analisar(l, { causa, evento: sel.evento, ano: sel.ano, sexo: sel.sexo, idade: sel.idade })));
  }catch(erro){ if(token === renderToken) saida.innerHTML = erroHtml(erro); return; }
  if(token !== renderToken) return;
  if(!analises[0].disponivel){ saida.innerHTML = `<div class="card">${indisponivelHtml(analises[0], causa)}</div>`; return; }
  const maximo = Math.max(...analises.map(a => a.taxa || 0), 0.0001);
  const temUF = locais.some(l => UF_NAMES[l]), temMun = locais.some(ehMunicipio);
  const municipios = locais.filter(ehMunicipio);
  const indicadores = base.dicionario.indicadores.filter(i => i.id !== "area_km2");
  saida.innerHTML = `<div class="card">
      <h2>Resultado</h2>
      ${tabelaHtml(
        [{ t:"Local" }, { t: ev.rotulo, num:true }, { t:"População", num:true }, { t:"Taxa por 100 mil", num:true }, { t:"Intervalo de 95% da taxa" }, { t:"Mesma escala" }],
        analises.map(a => {
          const ic = a.pop && a.n != null ? intervaloPoisson(a.n).map(v => v / a.pop.valor * POR) : null;
          return [h(nomeLocal(a.local)) + (a.local === "BR" ? " (referência)" : ""), fmtNum.format(a.n), a.pop ? fmtNum.format(a.pop.valor) : "sem população", fmtValor(a.taxa),
            ic ? `${fmtValor(ic[0])} a ${fmtValor(ic[1])}` : "—", `<span class="barra" style="width:${a.taxa == null ? 0 : Math.max(2, 100 * a.taxa / maximo)}%"></span>`];
        }), { legenda:`${ev.taxa} — mesma medida e período para todos os locais` })}
      <ul class="avisos">
        <li>Quando os intervalos de 95% de dois locais se sobrepõem, a diferença entre eles pode ser fruto do acaso.</li>
        <li>Taxas brutas, sem ajuste por idade: locais com população mais velha tendem a ter taxas maiores para doenças crônicas.</li>
        ${temUF && temMun ? "<li>Você está comparando estados e municípios: um estado reúne realidades muito diferentes e tem taxas mais estáveis que um município pequeno.</li>" : ""}
      </ul>
      ${avisosPeriodo(sel.evento, sel.ano)}${linhaFonte(sel.evento, sel.ano)}
      <button id="cmpCsv" class="btn ghost no-print" type="button">Exportar CSV</button>
    </div>
    ${municipios.length ? `<div class="card"><h2>Indicadores do território</h2>
      <p class="sub">Somente para municípios: estes indicadores não são replicados de estados para municípios nem o contrário.</p>
      ${tabelaHtml([{ t:"Indicador" }, { t:"Ano" }, ...municipios.map(l => ({ t: nomeLocal(l), num:true })), { t:"Brasil", num:true }],
        indicadores.map(i => [`${h(i.nome)} <small>(${h(i.unidade)})</small>`, String(i.ano),
          ...municipios.map(l => { const v = base.indicadores.get(l)?.[i.id]; return v == null ? h(motivoSemIndicador(l, i.id)) : fmtValor(v, i.casas); }),
          `${fmtValor(i.ref.BR, i.casas)}${i.ref_tipo.startsWith("mediana") ? " <small>(mediana)</small>" : ""}`]),
        { legenda:"Indicadores territoriais dos municípios comparados" })}</div>` : ""}`;
  $("cmpCsv").addEventListener("click", () => baixarCSV(`comparacao_${sel.evento}_${sel.ano}.csv`,
    [["local", "eventos", "populacao", "taxa_por_100mil"], ...analises.map(a => [nomeLocal(a.local), a.n, a.pop?.valor ?? "", a.taxa == null ? "" : a.taxa.toFixed(2)])],
    notasExportacao(sel.evento, causa, sel.ano)));
}

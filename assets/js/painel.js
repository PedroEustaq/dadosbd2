/* ============================================================
   Painel: componentes comuns e áreas Entrada, Mapa,
   Análise municipal e Comparar locais
   ------------------------------------------------------------
   Cada tela tem três profundidades:
     1. leitura inicial  — resultado principal e próxima ação;
     2. investigação     — evolução, comparações, fatores;
     3. verificação      — dados completos, critérios e fontes,
                           sempre em um "Como chegamos a…" junto ao resultado.
   ============================================================ */

/* ---------- Componentes ---------- */
/* Rótulos discretos que separam a natureza de cada informação. */
const ROTULOS = {
  fato: "Observado",
  comparacao: "Comparação",
  literatura: "O que se sabe",
  associacao: "Associação exploratória",
  hipotese: "Hipótese a investigar"
};
const rot = tipo => `<span class="rot rot-${tipo}">${h(ROTULOS[tipo])}</span>`;

function tabelaHtml(colunas, linhas, { legenda = "", classe = "" } = {}){
  return `<div class="table-wrap"><table class="${classe}">
    ${legenda ? `<caption>${h(legenda)}</caption>` : ""}
    <thead><tr>${colunas.map(c => `<th scope="col"${c.num ? ' class="num"' : ""}>${h(c.t)}</th>`).join("")}</tr></thead>
    <tbody>${linhas.map(l => `<tr>${l.map((v, i) => `<td${colunas[i].num ? ' class="num"' : ""}>${v}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

/* Expansão padrão para o que é consultado sob demanda. */
function mais(titulo, corpo, { aberto = false, id = "" } = {}){
  return `<details class="mais"${id ? ` id="${id}"` : ""}${aberto ? " open" : ""}><summary>${titulo}</summary><div class="mais-corpo">${corpo}</div></details>`;
}

/* ---------- Estrutura das páginas ----------
   Toda página usa as mesmas peças:
   cabecalhoPagina  → contexto, título, descrição e ações da página
   cartao           → seção com cabeçalho (título + ações), corpo e rodapé
   grade            → disposição das seções: "dupla" (2/3 + 1/3), "lateral"
                      (painel de controle à esquerda + resultado) ou "par" */
function cabecalhoPagina({ titulo, contexto = "", descricao = "", acoes = "", id = "" }){
  return `<header class="pg-cab">
    <div class="pg-cab-texto">
      ${contexto ? `<p class="pg-contexto">${contexto}</p>` : ""}
      <h1${id ? ` id="${id}"` : ""}>${titulo}</h1>
      ${descricao ? `<p class="pg-descricao">${descricao}</p>` : ""}
    </div>
    ${acoes ? `<div class="pg-acoes no-print">${acoes}</div>` : ""}
  </header>`;
}

let _cartaoSeq = 0;
function cartao({ titulo = "", descricao = "", acoes = "", corpo = "", rodape = "", id = "", classe = "", nivel = 2 }){
  const tid = `ct${++_cartaoSeq}`;
  return `<section class="cartao${classe ? ` ${classe}` : ""}"${id ? ` id="${id}"` : ""}${titulo ? ` aria-labelledby="${tid}"` : ""}>
    ${titulo || acoes ? `<header class="cartao-cab">
      <div>${titulo ? `<h${nivel} id="${tid}" class="cartao-titulo">${titulo}</h${nivel}>` : ""}${descricao ? `<p class="cartao-descricao">${descricao}</p>` : ""}</div>
      ${acoes ? `<div class="cartao-acoes no-print">${acoes}</div>` : ""}
    </header>` : ""}
    <div class="cartao-corpo">${corpo}</div>
    ${rodape ? `<footer class="cartao-rodape">${rodape}</footer>` : ""}
  </section>`;
}

/* Bloco recolhível: título e resumo sempre visíveis; o conteúdo abre num clique. */
function recolhivel({ titulo, resumo = "", corpo = "", id = "", aberto = false }){
  return `<details class="recolhivel"${id ? ` id="${id}"` : ""}${aberto ? " open" : ""}>
    <summary><span class="recolhivel-texto"><span class="recolhivel-titulo">${titulo}</span>${resumo ? `<span class="recolhivel-resumo">${resumo}</span>` : ""}</span>
      <span class="recolhivel-acao" aria-hidden="true"></span></summary>
    <div class="recolhivel-corpo">${corpo}</div>
  </details>`;
}

const grade = (tipo, ...partes) => `<div class="grade grade-${tipo}">${partes.filter(Boolean).join("")}</div>`;
const coluna = (...partes) => `<div class="grade-col">${partes.filter(Boolean).join("")}</div>`;

function refsHtml(ids){
  const refs = base.conhecimento.referencias;
  return `<ul class="refs">${ids.filter(id => refs[id]).map(id =>
    `<li><a href="${h(urlSegura(refs[id].url))}" target="_blank" rel="noopener noreferrer">${h(refs[id].org)} — ${h(refs[id].titulo)}</a></li>`).join("")}</ul>`;
}

/* Barras horizontais na mesma escala: a representação principal das comparações. */
function barrasHtml(itens){
  const maximo = Math.max(...itens.map(i => i.valor || 0), 0.0001);
  return `<ul class="barras">${itens.map(i => `<li${i.destaque ? ' class="destaque"' : ""}>
    <span class="b-nome">${i.nome}</span>
    <span class="b-trilho"><span class="b-barra${i.parcial ? " parcial" : ""}" style="width:${i.valor == null ? 0 : Math.max(1.5, 100 * i.valor / maximo)}%"></span></span>
    <span class="b-valor">${i.texto}</span></li>`).join("")}</ul>`;
}

/* Faixa de indicadores-chave (KPIs): o que se lê em 5 segundos.
   itens: [{ rotulo, valor, nota, tom: "principal"|"acima"|"abaixo"|"compativel"|"" }] */
function kpisHtml(itens, classe = ""){
  return `<div class="kpis ${classe}">${itens.map(i => `<div class="kpi${i.tom ? ` kpi-${i.tom}` : ""}">
    <p class="kpi-rot">${i.rotulo}</p><p class="kpi-valor">${i.valor}</p>${i.nota ? `<p class="kpi-nota">${i.nota}</p>` : ""}</div>`).join("")}</div>`;
}

/* Gráfico de tendência (linhas por ano), em SVG sem biblioteca.
   series: [{ nome, pontos:[{ ano, valor, parcial }] }] — a primeira série é a destacada.
   Pontos de períodos parciais ficam vazados e ligados por linha tracejada. */
function topoEscala(v){
  if(!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p * 2) / 2 * p;
}
function tendenciaSvg(series, { titulo = "", unidade = "", categorica = false } = {}){
  const anos = [...new Set(series.flatMap(s => s.pontos.map(p => p.ano)))].sort();
  const valores = series.flatMap(s => s.pontos.map(p => p.valor)).filter(v => v != null);
  if(anos.length < 2 || !valores.length) return "";
  // No celular o desenho é mais estreito (texto legível) e os nomes vão só na legenda.
  const estreito = matchMedia("(max-width: 600px)").matches;
  const W = estreito ? 360 : 900, H = estreito ? 220 : 250, m = { t:14, r: estreito ? 14 : 150, b:30, l:48 };
  const max = topoEscala(Math.max(...valores));
  const x = ano => m.l + anos.indexOf(ano) * (W - m.l - m.r) / (anos.length - 1);
  const y = v => m.t + (H - m.t - m.b) * (1 - v / max);
  const grade = [0, 1, 2, 3].map(i => max * i / 3);
  const temParcial = series.some(s => s.pontos.some(p => p.parcial && p.valor != null));
  const linhas = series.map((s, i) => {
    const pts = s.pontos.filter(p => p.valor != null);
    const completos = pts.filter(p => !p.parcial);
    let d = completos.map((p, j) => `${j ? "L" : "M"}${x(p.ano).toFixed(1)},${y(p.valor).toFixed(1)}`).join("");
    let tracejado = "";
    const parciais = pts.filter(p => p.parcial);
    if(parciais.length && completos.length){
      const ult = completos[completos.length - 1];
      tracejado = `<path class="tl-parcial" d="M${x(ult.ano).toFixed(1)},${y(ult.valor).toFixed(1)}${parciais.map(p => `L${x(p.ano).toFixed(1)},${y(p.valor).toFixed(1)}`).join("")}" />`;
    }
    const marcas = pts.map(p => `<circle class="${p.parcial ? "tl-vazado" : ""}" cx="${x(p.ano).toFixed(1)}" cy="${y(p.valor).toFixed(1)}" r="${i === 0 ? 4 : 3}"><title>${h(s.nome)} — ${h(p.ano)}${p.parcial ? " (parcial)" : ""}: ${fmtValor(p.valor)}</title></circle>`).join("");
    return { i, s, ult: pts[pts.length - 1], svg: `<g class="tl-serie tl-serie-${i}${s.ref ? " tl-ref" : ""}"><path d="${d}" />${tracejado}${marcas}</g>` };
  });
  // Rótulos diretos no fim de cada linha, afastados para não se sobreporem.
  const rotulos = estreito ? [] : linhas.filter(l => l.ult).map(l => ({ ...l, ry: y(l.ult.valor) })).sort((a, b) => a.ry - b.ry);
  for(let k = 1; k < rotulos.length; k++) if(rotulos[k].ry - rotulos[k - 1].ry < 15) rotulos[k].ry = rotulos[k - 1].ry + 15;
  const resumo = series.map(s => `${s.nome}: ${s.pontos.filter(p => p.valor != null).map(p => `${p.ano}${p.parcial ? " parcial" : ""} ${fmtValor(p.valor)}`).join(", ")}`).join(". ");
  return `<figure class="tendencia${categorica ? " categorica" : ""}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${h(`${titulo}. ${resumo}`)}">
      ${grade.map(v => `<g class="tl-grade"><line x1="${m.l}" x2="${W - m.r + 8}" y1="${y(v)}" y2="${y(v)}" /><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${fmtValor(v, v < 10 && max < 10 ? 1 : 0)}</text></g>`).join("")}
      ${anos.map(a => { const parcial = series[0].pontos.find(p => p.ano === a)?.parcial; return `<text class="tl-ano" x="${x(a)}" y="${H - 8}" text-anchor="middle">${h(a)}${parcial ? "*" : ""}</text>`; }).join("")}
      ${linhas.map(l => l.svg).join("")}
      ${rotulos.map(r => `<text class="tl-rotulo tl-rotulo-${r.i}${r.s.ref ? " tl-ref" : ""}" x="${x(r.ult.ano) + 10}" y="${r.ry + 4}">${h(r.s.nome.length > 18 ? r.s.nome.slice(0, 17) + "…" : r.s.nome)}</text>`).join("")}
    </svg>
    ${series.length > 1 ? `<ul class="tl-legenda">${series.map((s, i) => `<li class="tl-serie-${i}${s.ref ? " tl-ref" : ""}"><svg width="22" height="10" aria-hidden="true"><line x1="1" x2="21" y1="5" y2="5" /></svg>${h(s.nome)}</li>`).join("")}</ul>` : ""}
    <figcaption>${h(unidade)}${temParcial ? " · * ano parcial: cobre menos meses, não indica queda." : ""}</figcaption>
  </figure>`;
}

const GLOSSARIO = {
  taxa: "Taxa = número de eventos dividido pela população e multiplicado por 100.000. Permite comparar lugares de tamanhos diferentes.",
  preliminar: "Dado preliminar (prévia): o Ministério da Saúde ainda recebe e revisa registros. Os números aumentam nas publicações seguintes, principalmente nos últimos meses.",
  ic: "Intervalo de 95%: faixa de valores compatíveis com o número observado, considerando a variação ao acaso. Com poucos eventos a faixa fica larga.",
  residencia: "Os eventos são contados no município onde a pessoa morava, não onde foi atendida ou morreu.",
  notificacao: "Notificação é o registro de um caso suspeito ou confirmado feito pelo serviço de saúde. Depende de a pessoa procurar atendimento e de o serviço registrar.",
  padronizacao: "Ajuste por idade e sexo (padronização indireta): calcula quantos eventos seriam esperados se cada faixa de idade e sexo do município tivesse a mesma taxa do estado. Evita que um município pareça pior apenas por ter mais idosos."
};

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
  return `<p class="fonte">Fonte: ${h(EVENTOS[evento].fonte)} · ${h(rotuloPeriodo(evento, ano))} · por município de residência · <a href="${h(linkPara({ rota:"fontes" }))}">fontes e metodologia</a></p>`;
}

function intervaloTexto(c){
  return c?.ic ? `${fmt2.format(c.razao)} (intervalo de 95%: ${fmt2.format(c.ic[0])} a ${fmt2.format(c.ic[1])})` : "—";
}

/* Situação em texto + símbolo (nunca só cor). */
function statusHtml(c){
  if(!c || c.classe === "indisponivel") return `<span class="status status-neutro">sem base para comparar</span>`;
  const simbolo = { acima:"▲", abaixo:"▼", compativel:"●" }[c.classe];
  const texto = { acima:"Acima", abaixo:"Abaixo", compativel:"Sem diferença clara" }[c.classe];
  return `<span class="status status-${c.classe}"><span aria-hidden="true">${simbolo}</span> ${texto}</span>`;
}

/* A comparação em linguagem simples. */
function fraseComparacao(c, ev){
  const dif = Math.round(Math.abs(c.razao - 1) * 100);
  if(c.classe === "acima") return `cerca de ${dif}% mais ${ev.plural} do que o esperado para o tamanho da população`;
  if(c.classe === "abaixo") return `cerca de ${dif}% menos ${ev.plural} do que o esperado para o tamanho da população`;
  return "a diferença cabe no que a variação ao acaso explica";
}

/* Condições que mudam a interpretação: ficam sempre junto do resultado. */
function atencaoHtml(itens){
  return itens.length ? `<div class="atencao" role="note"><strong>Ao interpretar</strong><ul>${itens.map(i => `<li>${i}</li>`).join("")}</ul></div>` : "";
}

function alertaPeriodo(evento, ano){
  const info = infoAno(evento, ano);
  return info && !info.ano_completo ? `Período parcial (${h(info.periodo)}): os totais não foram projetados para o ano inteiro.` : "";
}

function erroHtml(erro){
  console.error(erro);
  return `<div class="estado estado-erro" role="alert"><h2>Não foi possível carregar estes dados</h2>
    <p>${h(erro?.message || erro)}</p><p>Verifique a conexão e tente de novo. As outras áreas continuam disponíveis.</p>
    <button class="btn" type="button" onclick="renderizar()">Tentar novamente</button></div>`;
}

const carregandoHtml = texto => `<p class="estado estado-carregando" role="status"><span class="spinner" aria-hidden="true"></span> ${h(texto)}</p>`;

function indisponivelHtml(disp, causa){
  const alternativa = disp.alternativa
    ? ` <a href="${h(linkPara({ causa: disp.alternativa }))}">Ver ${h(lerCausa(disp.alternativa).rotulo)}</a> ou <a href="${h(linkPara({ evento:"obitos" }))}">ver óbitos de ${h(causa.curto)}</a>.` : "";
  return `<div class="estado estado-indisponivel" role="status"><h2>Dado indisponível para esta combinação</h2>
    <p>${h(disp.motivo || `Não há dados de ${EVENTOS[sel.evento].plural} para ${sel.ano}.`)}${alternativa}</p>
    <p class="apoio">Isso não significa zero casos: significa que esta fonte não traz a informação.</p></div>`;
}

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

const tituloCausa = (evento, causa) => evento === "dengue" ? "Dengue" : causa.rotulo;
/* Ao imprimir, abre as expansões para que os detalhes saiam no papel. */
window.addEventListener("beforeprint", () => document.querySelectorAll("details").forEach(d => { d.open = true; }));

const unidadeTaxa = ev => `${ev.plural} por 100 mil habitantes`;

/* ============================================================
   Entrada
   ============================================================ */
let modoEntrada = "mun";

async function renderInicio(el){
  const modos = {
    mun: { rotulo:"Município", placeholder:"Digite o nome do município", buscar: opcoesMunicipio, escolher: item => navegar({ rota:"municipio", mun:item.valor }) },
    causa: { rotulo:"Doença", placeholder:"Ex.: infarto, dengue, câncer de mama, J18", buscar: opcoesCausa, escolher: item => navegar({ rota: sel.mun ? "municipio" : "mapa", causa:item.valor }) }
  };
  const ICONES = {
    mapa: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    locais: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    doencas: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>',
    fontes: '<path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z"/><path d="M8 8h8M8 12h6"/>'
  };
  const atalhos = [
    ["mapa", "Mapa do Brasil", linkPara({ rota:"mapa" })],
    ["locais", "Comparar municípios", linkPara({ rota:"comparar", modoCmp:"" })],
    ["doencas", "Comparar doenças", linkPara({ rota:"comparar", modoCmp:"doencas" })],
    ["busca", "Buscar uma doença", linkPara({ rota:"doencas", cid:"" })],
    ["fontes", "Fontes e metodologia", "#/fontes"]
  ];
  el.innerHTML = `
    <div class="entrada">
      <section class="busca-principal" aria-labelledby="entradaTitulo">
        <h1 id="entradaTitulo">Consultar um município</h1>
        <div class="segmentos" role="group" aria-label="Buscar por">
          ${Object.entries(modos).map(([id, m]) => `<button type="button" data-modo="${id}" aria-pressed="${id === modoEntrada}">${m.rotulo}</button>`).join("")}
        </div>
        <div class="combo">
          <label for="entradaBusca" class="sr-only" id="entradaRotulo"></label>
          <input id="entradaBusca" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="entradaLista" autocomplete="off" />
          <ul id="entradaLista" class="combo-list" role="listbox" aria-label="Resultados" hidden></ul>
        </div>
      </section>

      <section class="secao" aria-labelledby="acessoTitulo">
        <h2 id="acessoTitulo" class="secao-titulo">Acesso rápido</h2>
        <nav class="acesso-rapido" aria-labelledby="acessoTitulo">
          ${atalhos.map(([icone, nome, link]) => `<a href="${h(link)}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[icone]}</svg><span>${h(nome)}</span></a>`).join("")}
        </nav>
      </section>

      <section class="secao" aria-labelledby="brTitulo">
        <h2 id="brTitulo" class="secao-titulo">Brasil no último ano completo</h2>
        <div id="entradaKpis">${carregandoHtml("Somando os registros do Brasil...")}</div>
      </section>
    </div>`;
  renderKpisBrasil();
  const input = $("entradaBusca");
  const aplicar = () => {
    const m = modos[modoEntrada];
    input.placeholder = m.placeholder;
    $("entradaRotulo").textContent = `Buscar ${m.rotulo.toLowerCase()}`;
    el.querySelectorAll("[data-modo]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.modo === modoEntrada)));
  };
  criarCombobox(input, $("entradaLista"), texto => modos[modoEntrada].buscar(texto), item => modos[modoEntrada].escolher(item));
  el.querySelectorAll("[data-modo]").forEach(b => b.addEventListener("click", () => { modoEntrada = b.dataset.modo; input.value = ""; aplicar(); input.focus(); }));
  aplicar();
}

/* Panorama nacional da entrada: um número por sistema, sempre do último ano completo. */
async function renderKpisBrasil(){
  const todas = lerCausa("todas");
  const ultimoCompleto = ev => anosDe(ev).filter(a => infoAno(ev, a)?.ano_completo).pop();
  try{
    const itens = await Promise.all(Object.keys(EVENTOS).map(async ev => {
      const ano = ultimoCompleto(ev);
      if(!ano) return null;
      const n = await contarEventos("BR", todas, ev, ano);
      const t = taxa(n, popDe("BR", ano)?.valor);
      return { ev, ano, n, t };
    }));
    const el = $("entradaKpis");
    if(!el) return;
    el.innerHTML = kpisHtml(itens.filter(Boolean).map((i, k) => ({
      rotulo: `${h(EVENTOS[i.ev].rotulo)} em ${h(i.ano)}`, tom: k === 0 ? "principal" : "",
      valor: fmtNum.format(i.n), nota: `${fmtValor(i.t)} por 100 mil habitantes`
    })));
  }catch(erro){ console.error(erro); $("entradaKpis")?.remove(); }
}

/* ============================================================
   Mapa
   ============================================================ */
async function renderMapa(_el, token){
  const causa = lerCausa(sel.causa);
  const disp = disponibilidade(sel.evento, causa);
  const ev = EVENTOS[sel.evento];
  const focus = $("mapFocusSel");
  if(!focus.options.length){
    focus.innerHTML = '<option value="">Brasil, por estado</option>' + [...ALL_UFS].sort((a, b) => ptCollator.compare(UF_NAMES[a], UF_NAMES[b]))
      .map(uf => `<option value="${uf}">${h(UF_NAMES[uf])}, por município</option>`).join("");
  }
  $("mapTitulo").textContent = tituloCausa(sel.evento, causa);
  $("mapSub").textContent = `${ev.taxa} por 100 mil habitantes · ${rotuloPeriodo(sel.evento, sel.ano)}`;
  $("mapLegend").innerHTML = legendaMapaHtml();
  const aviso = $("mapAviso");
  const disponivel = disp.ok && Boolean(infoAno(sel.evento, sel.ano));
  if(!disponivel){
    $("mapKpis").innerHTML = ""; $("mapRanking").innerHTML = "";
    aviso.innerHTML = indisponivelHtml(disp, causa);
    $("mapTabela").innerHTML = "";
    await carregarMapa();
    mapa.consulta = null; mapa.ufs = new Map(); mapa.municipios = new Map(); mapa.taxaBR = null;
    restyleMap();
    return;
  }
  aviso.innerHTML = atencaoHtml([
    alertaPeriodo(sel.evento, sel.ano),
    sel.sexo || sel.idade ? "O mapa mostra a população total: os filtros de sexo e idade não se aplicam aqui." : ""
  ].filter(Boolean));
  await carregarMapa();
  if(mapa.erro) aviso.innerHTML += `<div class="estado estado-erro" role="alert"><p>${h(mapa.erro)}</p></div>`;
  const atual = await atualizarDadosMapa({ causa, evento: sel.evento, ano: sel.ano });
  if(!atual || token !== renderToken) return;
  renderKpisMapa();
  if(map) map.invalidateSize();
  const ufMun = sel.mun ? ufDe(sel.mun) : "";
  if(map && ufMun && !mapa.focoUF && !mapa._focoInicial){ mapa._focoInicial = true; setMapView(ufMun); }
  await Promise.all([renderRankingMapa(token), renderTabelaMapa(token)]);
}

/* TOPO do mapa: números-chave do Brasil e quantos estados ficam acima ou abaixo. */
function renderKpisMapa(){
  const ev = EVENTOS[mapa.consulta.evento];
  const classes = ALL_UFS.map(uf => medidaMapa(mapa.ufs.get(uf))).filter(m => m.estado === "ok");
  const acima = classes.filter(m => m.classe >= 3).length, abaixo = classes.filter(m => m.classe <= 1).length;
  const extremos = ALL_UFS.map(uf => ({ uf, ...mapa.ufs.get(uf) })).filter(u => u.taxa != null).sort((a, b) => b.taxa - a.taxa);
  $("mapKpis").innerHTML = kpisHtml([
    { rotulo:"Taxa do Brasil", tom:"principal", valor: fmtValor(mapa.taxaBR), nota:`${h(ev.plural)} por 100 mil habitantes` },
    { rotulo:"Estados bem acima do Brasil", tom: acima ? "acima" : "", valor: `${acima} <small>de 27</small>`, nota: extremos[0] ? `maior taxa: ${h(UF_NAMES[extremos[0].uf])}` : "" },
    { rotulo:"Estados bem abaixo do Brasil", tom: abaixo ? "abaixo" : "", valor: `${abaixo} <small>de 27</small>`, nota: extremos.length ? `menor taxa: ${h(UF_NAMES[extremos[extremos.length - 1].uf])}` : "" }
  ], "kpis-mapa");
}

/* BASE do mapa: quebra por região — maiores e menores taxas do nível visível.
   Locais com poucos eventos (taxa instável) ficam fora da lista. */
async function renderRankingMapa(token = renderToken){
  const el = $("mapRanking");
  if(!el || !mapa.consulta || sel.rota !== "mapa") return;
  const foco = mapa.focoUF;
  let itens;
  if(foco){
    try{ await carregarDadosMunicipais(foco); }catch(erro){ console.error(erro); el.innerHTML = ""; return; }
    if(token !== renderToken) return;
    itens = [...mapa.municipios.values()].filter(m => m.uf === foco).map(m => ({ nome:m.nome, codigo:m.c, ...m }));
  }else itens = ALL_UFS.map(uf => ({ nome: UF_NAMES[uf], codigo: uf, ...mapa.ufs.get(uf) }));
  const estaveis = itens.filter(i => medidaMapa(i).estado === "ok").sort((a, b) => b.taxa - a.taxa);
  const fora = itens.length - estaveis.length;
  if(estaveis.length < 4){ el.innerHTML = ""; return; }
  const n = Math.min(5, Math.floor(estaveis.length / 2));
  const nomeItem = i => foco ? `<a href="${h(linkPara({ rota:"municipio", mun:i.codigo }))}">${h(i.nome)}</a>` : `<button class="link-button" type="button" data-foco="${i.codigo}">${h(i.nome)}</button>`;
  const lista = arr => barrasHtml(arr.map(i => ({ nome: nomeItem(i), valor: i.taxa, texto: fmtValor(i.taxa) })));
  const onde = foco ? `municípios de ${h(UF_NAMES[foco])}` : "estados";
  el.innerHTML = cartao({ titulo:`Maiores taxas entre os ${onde}`, corpo: lista(estaveis.slice(0, n)), nivel:2 }) +
    cartao({ titulo:`Menores taxas entre os ${onde}`, corpo: lista(estaveis.slice(-n).reverse()), nivel:2,
      rodape: `${foco ? "Clique num município para abrir a análise." : "Clique num estado para ver os municípios."}${fora ? ` ${fora} ${foco ? "municípios" : "estados"} com poucos eventos ficaram fora (taxa instável).` : ""}` });
  el.querySelectorAll("[data-foco]").forEach(b => b.addEventListener("click", () => setMapView(b.dataset.foco)));
}

/* A tabela equivalente ao mapa abre só quando pedida. */
function alternarTabelaMapa(abrir = !mapa._tabelaAberta){
  mapa._tabelaAberta = abrir;
  const botao = $("mapTabelaBtn");
  botao.setAttribute("aria-expanded", String(abrir));
  botao.textContent = abrir ? "Ocultar tabela" : "Ver como tabela";
  $("mapTabela").hidden = !abrir;
  if(abrir) renderTabelaMapa().then(() => $("mapTabela").scrollIntoView({ behavior:"smooth", block:"start" }));
}

async function renderTabelaMapa(token = renderToken){
  const el = $("mapTabela");
  if(!mapa.consulta || sel.rota !== "mapa" || !mapa._tabelaAberta) return;
  const ev = EVENTOS[mapa.consulta.evento];
  const foco = mapa.focoUF;
  let linhas;
  if(foco){
    try{ await carregarDadosMunicipais(foco); }catch(erro){ el.innerHTML = erroHtml(erro); return; }
    if(token !== renderToken) return;
    linhas = [...mapa.municipios.values()].filter(m => m.uf === foco).map(m => ({ nome:m.nome, codigo:m.c, ...m }));
  }else linhas = ALL_UFS.map(uf => ({ nome: UF_NAMES[uf], codigo: uf, ...mapa.ufs.get(uf) }));
  linhas.sort((a, b) => (b.taxa ?? -1) - (a.taxa ?? -1));
  const mostrar = foco ? linhas.slice(0, mapa._tabelaTudo ? linhas.length : 30) : linhas;
  const classe = item => {
    const m = medidaMapa(item);
    return m.estado === "ok" ? MAP_CLASSES[m.classe].rotulo : (m.estado === "instavel" ? "poucos eventos: taxa instável" : "sem dado");
  };
  el.innerHTML = cartao({
    titulo: foco ? `Municípios de ${h(UF_NAMES[foco])}` : "Estados",
    descricao: "Ordenada pela taxa, não pelo total (que acompanha o tamanho da população).",
    acoes: `<button id="mapCsv" class="btn-texto" type="button">Exportar CSV</button>`,
    corpo: `${tabelaHtml(
      [{ t: foco ? "Município" : "Estado" }, { t:"Taxa por 100 mil", num:true }, { t: ev.rotulo, num:true }, { t:"População", num:true }, { t:"Em relação ao Brasil" }],
      mostrar.map(l => [
        foco ? `<a href="${h(linkPara({ rota:"municipio", mun:l.codigo }))}">${h(l.nome)}</a>` : `<button class="link-button" type="button" data-foco="${l.codigo}">${h(l.nome)}</button>`,
        fmtValor(l.taxa), l.n == null ? "—" : fmtNum.format(l.n), l.pop == null ? "sem população" : fmtNum.format(l.pop), h(classe(l))
      ]), { legenda:`${ev.taxa}, ${tituloCausa(mapa.consulta.evento, mapa.consulta.causa)}, ${rotuloPeriodo(mapa.consulta.evento, mapa.consulta.ano)}` })}
    ${foco && linhas.length > mostrar.length ? `<button id="mapMais" class="btn-sec" type="button">Mostrar os ${linhas.length} municípios</button>` : ""}`,
    rodape: linhaFonte(mapa.consulta.evento, mapa.consulta.ano) });
  el.querySelectorAll("[data-foco]").forEach(b => b.addEventListener("click", () => setMapView(b.dataset.foco)));
  $("mapMais")?.addEventListener("click", () => { mapa._tabelaTudo = true; renderTabelaMapa(); });
  $("mapCsv").addEventListener("click", () => baixarCSV(`mapa_${mapa.consulta.evento}_${mapa.consulta.ano}.csv`,
    [["local", "codigo", "eventos", "populacao", "taxa_por_100mil", "em_relacao_ao_brasil"],
      ...linhas.map(l => [l.nome, l.codigo, l.n ?? "", l.pop ?? "", l.taxa == null ? "" : decimalCSV(l.taxa), classe(l)])],
    notasExportacao(mapa.consulta.evento, mapa.consulta.causa, mapa.consulta.ano)));
}
document.addEventListener("mapa:nivel", () => { mapa._tabelaTudo = false; renderRankingMapa(); renderTabelaMapa(); });

/* ============================================================
   Análise municipal
   ============================================================ */
let nivelCausas = "capitulo";

/* Cabeçalho comum à análise e aos fatores: nome do lugar e abas de aprofundamento. */
/* Cabeçalho da página do município: nome, estado e população; atalhos para as seções. */
function cabecalhoMunicipio(acoes = ""){
  const m = base.munPorCodigo.get(sel.mun);
  const populacao = popDe(sel.mun, sel.ano) || popDe(sel.mun, "2025");
  const secoes = [["sec-resultado", "Resultado"], ["sec-evolucao", "Evolução"], ["sec-melhorias", "Fatores e melhorias"], ["sec-causas", "Principais causas"]];
  return `${cabecalhoPagina({
      contexto: `${h(UF_NAMES[m.uf])} · ${populacao ? `${fmtNum.format(populacao.valor)} habitantes` : "população não disponível"}`,
      titulo: h(m.n), acoes })}
    <nav class="nesta-pagina no-print" aria-label="Nesta página">${secoes.map(([id, t]) => `<a href="#${id}" data-ancora="${id}">${h(t)}</a>`).join("")}</nav>`;
}

function semMunicipioHtml(titulo, texto){
  return `<div class="estado estado-vazio"><h1>${h(titulo)}</h1><p>${h(texto)}</p>
    <button class="btn" type="button" onclick="_segOrigem='mun';abrirConsulta('mun')">Escolher município</button></div>`;
}

async function renderMunicipio(el, token){
  if(!sel.mun || !base.munPorCodigo.has(sel.mun)){
    el.innerHTML = semMunicipioHtml("Município", "Escolha um município no filtro acima para ver o resultado, a evolução, os fatores e as melhorias.");
    return;
  }
  const causa = lerCausa(sel.causa);
  const opcoes = { causa, evento: sel.evento, ano: sel.ano, sexo: sel.sexo, idade: sel.idade };
  el.innerHTML = `${cabecalhoMunicipio(`<a class="btn-sec" href="${h(linkPara({ rota:"mapa" }))}">Ver no mapa</a><button id="csvBtn" class="btn-texto" type="button">Exportar CSV</button><button id="imprimirBtn" class="btn-texto" type="button">Imprimir</button>`)}
    <div id="munCorpo">${carregandoHtml("Calculando os indicadores do município...")}</div>`;
  $("imprimirBtn").addEventListener("click", () => window.print());
  ligarAncoras(el);
  const corpo = $("munCorpo");

  let analise, serie;
  try{
    [analise, serie] = await Promise.all([analisar(sel.mun, opcoes), serieAnual(sel.mun, opcoes)]);
  }catch(erro){
    if(token === renderToken) corpo.innerHTML = erroHtml(erro);
    return;
  }
  if(token !== renderToken) return;
  $("csvBtn").addEventListener("click", () => exportarMunicipio(analise, serie));

  let comp = null;
  try{ comp = analise.disponivel && !sel.sexo && !sel.idade ? await comparaveis(sel.mun, causa, sel.evento, sel.ano) : null; }
  catch(erro){ console.error(erro); }
  if(token !== renderToken) return;

  // Uma página só, sempre na mesma ordem: resultado → evolução → fatores e melhorias → causas → detalhes.
  corpo.innerHTML = `
    <section id="sec-resultado" class="secao" aria-label="Resultado">${resultadoHtml(analise, comp)}</section>
    <section id="sec-evolucao" class="secao" aria-labelledby="sec-evolucao-t">
      <h2 id="sec-evolucao-t" class="secao-titulo">Evolução</h2>
      ${tendenciaMunicipioHtml(serie, opcoes) || `<p class="secao-intro">Não há anos suficientes com taxa para desenhar a evolução.</p>`}
      <div class="extras">${mais("Tabela ano a ano", evolucaoHtml(serie, opcoes))}</div>
    </section>
    ${secaoFatoresHtml(sel.mun)}
    <section id="sec-causas" class="secao" aria-labelledby="sec-causas-t">
      <h2 id="sec-causas-t" class="secao-titulo">Principais causas</h2>
      ${recolhivel({ titulo:`Causas com mais ${h(EVENTOS[sel.evento].plural)} em ${h(base.munPorCodigo.get(sel.mun).n)}`,
        resumo:`<span id="munCausasResumo">${h(rotuloPeriodo(sel.evento, sel.ano))}</span>`,
        corpo:`<div id="munCausas">${carregandoHtml("Somando as causas...")}</div>` })}
    </section>
    <section class="secao" aria-label="Detalhes do cálculo">${verificacaoHtml(analise, comp)}</section>`;
  ligarSecaoFatores(corpo, sel.mun);
  ligarAncoras(corpo);
  renderCausasMunicipio(token);

  // Links antigos (#/fatores, ?v=evolucao, ?v=causas) abrem direto na seção correspondente.
  const alvo = sel.rota === "fatores" ? "sec-melhorias" : { evolucao:"sec-evolucao", causas:"sec-causas" }[sel.visao];
  if(alvo){
    requestAnimationFrame(() => $(alvo)?.scrollIntoView({ block:"start" }));
    history.replaceState(null, "", linkPara({ rota:"municipio", visao:"" }));
  }
}

function ligarAncoras(el){
  el.querySelectorAll("[data-ancora]").forEach(a => a.addEventListener("click", ev => {
    ev.preventDefault();
    $(a.dataset.ancora)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block:"start" });
  }));
}

/* TOPO do painel: a situação em uma frase (manchete) e os números-chave.
   Deve ser entendido em poucos segundos. */
function resultadoHtml(a, comp){
  const ev = EVENTOS[a.evento];
  if(!a.disponivel) return `<section class="resultado">${indisponivelHtml(a, a.causa)}</section>`;

  const semPop = !a.pop;
  const uf = ufDe(a.local);
  const c = a.comparacao;
  const p = a.padronizado;
  const atencao = [];
  const parcial = alertaPeriodo(a.evento, a.ano);
  if(parcial) atencao.push(`${parcial} Não compare com anos completos.`);
  if(semPop) atencao.push("Não há população publicada para este município neste ano; por isso a taxa não foi calculada.");
  if(a.pop?.defasado) atencao.push(`A população usada é de ${h(a.pop.ano)} e os eventos são de ${h(a.ano)}.`);
  if(a.n === 0) atencao.push("Nenhum registro no arquivo publicado. Isso não prova ausência da doença: pode haver sub-registro, registro com outra causa ou informações ainda não enviadas.");
  else if(c?.poucos) atencao.push("Menos de 10 registros: a comparação é instável e um único caso muda bastante o resultado.");
  if(a.causa.natureza && a.causa.natureza !== "doença" && a.evento !== "dengue") atencao.push(`Este item da CID não é propriamente uma doença: ${h(a.causa.natureza)}.`);

  // Manchete: a comparação que vale. Se o ajuste por idade muda a leitura, ele vira a manchete.
  const temComp = c && c.classe !== "indisponivel";
  const ajusteValido = p && p.classe !== "indisponivel";
  const ajusteMuda = temComp && ajusteValido && p.classe !== c.classe;
  const principal = ajusteMuda ? p : c;
  let manchete;
  if(temComp){
    const aoRef = ehMunicipio(a.local) ? `ao estado (${uf})` : "ao Brasil";
    const titulo = { acima:`Acima do esperado em relação ${aoRef}`, abaixo:`Abaixo do esperado em relação ${aoRef}`, compativel:`Sem diferença clara em relação ${aoRef}` }[principal.classe];
    const nota = ajusteMuda
      ? `Considerando idade e sexo da população: ${h(fraseComparacao(p, ev))}.`
      : `${h(fraseComparacao(c, ev)).replace(/^./, l => l.toUpperCase())}.`;
    manchete = `<div class="manchete manchete-${principal.classe}">
      <span class="manchete-icone" aria-hidden="true">${{ acima:"▲", abaixo:"▼", compativel:"●" }[principal.classe]}</span>
      <div><p class="manchete-titulo">${h(titulo)}</p><p class="manchete-nota">${nota}</p>
      ${oQueFazerHtml(principal.classe, c.poucos, a.evento)}</div></div>`;
  }else{
    manchete = `<div class="manchete manchete-neutro"><span class="manchete-icone" aria-hidden="true">–</span>
      <div><p class="manchete-titulo">Sem base para comparar</p><p class="manchete-nota">${semPop ? "Falta a população do período para calcular a taxa." : "Não há taxa de referência compatível para este recorte."}</p></div></div>`;
  }

  const refUF = (a.refs || []).find(r => r.local !== "BR");
  const refBR = (a.refs || []).find(r => r.local === "BR");
  const kpis = kpisHtml([
    { rotulo:"Taxa por 100 mil habitantes", tom:"principal",
      valor: semPop ? "não calculada" : fmtValor(a.taxa),
      nota: semPop ? "sem população no período" : `${h(ev.plural)} por 100 mil` },
    { rotulo:`${h(ev.rotulo)} registrados`, valor: fmtNum.format(a.n),
      nota: "no período" },
    refUF ? { rotulo:`Taxa do estado (${h(refUF.local)})`, valor: fmtValor(refUF.taxa), nota: "referência" } : null,
    refBR ? { rotulo:"Taxa do Brasil", valor: fmtValor(refBR.taxa), nota: "referência" } : null
  ].filter(Boolean));

  return `<section class="resultado" aria-label="Resumo">
    ${manchete}
    ${kpis}
    ${atencaoHtml(atencao)}
  </section>`;
}

/* Ação ligada ao resultado: o que fazer ao ver "acima", "abaixo" ou "sem diferença". */
function oQueFazerHtml(classe, poucos, evento){
  const fatores = `<a href="#sec-melhorias" data-ancora="sec-melhorias">fatores e melhorias</a>`;
  const evolucao = `<a href="#sec-evolucao" data-ancora="sec-evolucao">evolução</a>`;
  let texto;
  if(poucos) texto = `poucos registros: antes de agir, veja a ${evolucao} de vários anos ou um grupo de causas mais amplo.`;
  else if(classe === "acima") texto = `veja na ${evolucao} se o excesso se repete nos outros anos e consulte os ${fatores}. Se se repetir, é caso para a vigilância em saúde do município.`;
  else if(classe === "abaixo") texto = evento === "obitos"
    ? `antes de concluir que está melhor, verifique sub-registro (óbitos por causas mal definidas, envio atrasado) e compare com municípios parecidos.`
    : `antes de concluir que está melhor, verifique se há subnotificação ou atendimento fora do SUS e compare com municípios parecidos.`;
  else texto = `o município está dentro do esperado. Acompanhe a ${evolucao} ao longo dos anos.`;
  return `<p class="manchete-acao"><strong>O que fazer:</strong> ${texto}</p>`;
}

/* MEIO do painel: tendência ao longo dos anos, município × estado × Brasil. */
function tendenciaMunicipioHtml(serie, opcoes){
  const ev = EVENTOS[opcoes.evento];
  const comTaxa = serie.filter(s => s.disponivel && s.taxa != null);
  if(comTaxa.length < 2) return "";
  const ponto = (s, local) => {
    const r = local == null ? s : (s.refs || []).find(x => x.local === local);
    return { ano: s.ano, valor: r?.taxa ?? null, parcial: !s.info?.ano_completo };
  };
  const uf = ufDe(sel.mun);
  const series = [
    { nome: base.munPorCodigo.get(sel.mun).n, pontos: serie.map(s => ponto(s)) },
    { nome: `Estado (${uf})`, pontos: serie.map(s => ponto(s, uf)) },
    { nome: "Brasil", pontos: serie.map(s => ponto(s, "BR")) }
  ];
  const defasada = serie.some(s => s.pop?.defasado);
  return cartao({
    titulo: "Taxa por ano", nivel: 3,
    descricao: `Município, estado e Brasil · ${h(ev.taxa.toLowerCase())} por 100 mil habitantes`,
    corpo: tendenciaSvg(series, { titulo:`${ev.taxa} por ano`, unidade: defasada ? "Em anos sem estimativa oficial de população, foi usado o Censo 2022." : "" })
  });
}

/* BASE do painel: números completos, critério e fonte (verificação sob demanda). */
function verificacaoHtml(a, comp){
  if(!a.disponivel) return "";
  const ev = EVENTOS[a.evento];
  const uf = ufDe(a.local);
  const c = a.comparacao, ref = a.referencia;
  const refs = [a, ...(a.refs || [])];
  const info = infoAno(a.evento, a.ano);
  const corpo = `
    ${tabelaHtml(
      [{ t:"Local" }, { t: ev.rotulo, num:true }, { t:"População", num:true }, { t:"Taxa por 100 mil", num:true }],
      refs.map(r => [h(nomeLocal(r.local)), fmtNum.format(r.n), r.pop ? `${fmtNum.format(r.pop.valor)} <small>${h(r.pop.origem)}</small>` : "—", fmtValor(r.taxa)]),
      { legenda:"Eventos, população e taxa no mesmo período e com os mesmos filtros" })}
    ${c && c.classe !== "indisponivel" ? `<p>${rot("comparacao")} Com a taxa de ${h(nomeLocal(ref.local))}, seriam esperados ${fmtValor(a.esperado)} ${h(ev.plural)}; foram registrados ${fmtNum.format(a.n)}. Razão entre observado e esperado: ${intervaloTexto(c)}.</p>` : ""}
    ${a.padronizado ? `<p>${rot("comparacao")} Com ajuste por idade e sexo (Censo 2022): esperados ${fmtValor(a.padronizado.esperado)}; razão ${intervaloTexto(a.padronizado)}.</p>` : ""}
    ${comp ? (comp.suficiente
      ? `<p>${rot("comparacao")} Entre os ${comp.n} municípios de ${h(UF_NAMES[uf])} com ${h(comp.porte)}, a taxa mediana é ${fmtValor(comp.mediana)} (metade fica entre ${fmtValor(comp.p25)} e ${fmtValor(comp.p75)}). Este município está acima de cerca de ${Math.round(comp.percentil)}% deles. A posição é relativa e não indica, sozinha, risco aumentado.</p>`
      : `<p>Há apenas ${comp.n} municípios de mesmo porte em ${h(UF_NAMES[uf])}: poucos para comparar com municípios parecidos.</p>`) : ""}
    <p><strong>Critério.</strong> O resultado é “acima” ou “abaixo” apenas quando todo o intervalo de 95% da razão fica acima ou abaixo de 1; caso contrário, a diferença pode ser fruto do acaso. ${h(GLOSSARIO.ic)} ${h(GLOSSARIO.padronizacao)}</p>
    <p><strong>Termos.</strong> ${h(GLOSSARIO.taxa)} ${h(GLOSSARIO.residencia)} ${h(a.evento === "dengue" ? GLOSSARIO.notificacao : a.evento === "obitos" ? GLOSSARIO.preliminar : ev.explica)}</p>
    ${a.evento === "obitos" && info ? `<p>${h(info.situacao || "")} Arquivo publicado em ${h(formatarData(info.publicado_em))}.</p>` : ""}
    ${linhaFonte(a.evento, a.ano)}`;
  return cartao({ classe:"cartao-detalhes", corpo: mais("Detalhes do cálculo e fonte", corpo) });
}

/* Resumo de fatores do panorama: no máximo três linhas e o caminho para a análise completa. */
function resumoFatoresHtml(mun, causa, evento){
  const causaFatores = evento === "dengue" ? lerCausa("c:A90") : causa;
  const link = linkPara({ rota:"fatores" });
  const titulo = "Fatores e melhorias";
  if(causaFatores.tipo === "todas"){
    return cartao({ titulo, corpo:`<p>Escolha uma doença ou grupo para ver os fatores do território ligados a ela.</p>`, rodape:`<a class="seguir" href="${h(link)}">Ver o perfil do território</a>` });
  }
  const lista = fatoresDaCausa(mun, causaFatores);
  if(!lista.length){
    return cartao({ titulo, corpo:`<p>Não há relações documentadas entre esta condição e os indicadores do território.</p>`, rodape:`<a class="seguir" href="${h(link)}">Ver o perfil do território</a>` });
  }
  const emAtencao = lista.filter(f => f.atencao.nivel === "atencao");
  const mostrar = (emAtencao.length ? emAtencao : lista).slice(0, 3);
  return cartao({ titulo, rodape:`<a class="seguir" href="${h(link)}">Ver todas as melhorias</a>`, corpo: `
    <p>${emAtencao.length
      ? `<strong>${emAtencao.length === 1 ? "1 ponto de atenção" : `${emAtencao.length} pontos de atenção`}</strong> entre ${lista.length} fatores ligados a esta condição (25% piores do estado).`
      : `Nenhum dos ${lista.length} indicadores ligados a esta condição está entre os mais desfavoráveis do estado. Isso não descarta os fatores: os indicadores são indiretos.`}</p>
    <ul class="lista-fatores">${mostrar.map(f => `<li><span>${h(f.def.nome)}</span>
      <span class="lf-valor">${f.ind.disponivel ? `${fmtValor(f.ind.valor, f.def.casas)} <small>${h(f.def.unidade)} · estado ${fmtValor(f.ind.refUF, f.def.casas)}</small>` : "<small>sem valor local</small>"}</span></li>`).join("")}</ul>
    ${(() => { const m = melhoriasDaCausa(lista)[0]; return m ? `<p class="lf-melhoria"><strong>${m.prioridade ? "Melhoria prioritária" : "Melhoria recomendada"}:</strong> ${h(m.texto)}</p>` : ""; })()}` });
}

async function renderTopCausas(token){
  const el = $("panCausas");
  if(!el) return;
  if(sel.evento === "dengue"){ el.remove(); return; }
  el.innerHTML = cartao({ titulo:"Principais causas", corpo: carregandoHtml("Somando as causas...") });
  let itens;
  try{ itens = await principaisCausas(sel.mun, sel.evento, sel.ano, "capitulo", 5); }catch(erro){ console.error(erro); el.remove(); return; }
  if(token !== renderToken) return;
  if(!itens.length){ el.innerHTML = cartao({ titulo:"Principais causas", corpo:`<p>Nenhum registro neste período no arquivo publicado. Ausência de registro não é ausência de doença.</p>` }); return; }
  const ev = EVENTOS[sel.evento];
  el.innerHTML = cartao({
    titulo: `Principais causas de ${h(ev.plural)}`,
    descricao: `Capítulos da CID-10, ${h(rotuloPeriodo(sel.evento, sel.ano))}`,
    corpo: barrasHtml(itens.map(i => ({ nome:`<a href="${h(linkPara({ causa: i.causa.id }))}">${h(i.causa.curto)}</a>`, valor: i.n, texto: fmtNum.format(i.n) }))),
    rodape: `<a class="seguir" href="${h(linkPara({ rota:"municipio", visao:"causas" }))}">Ver todas as causas</a>`
  });
}

function evolucaoHtml(serie, opcoes){
  const ev = EVENTOS[opcoes.evento];
  const validos = serie.filter(s => s.disponivel && s.taxa != null);
  if(!serie.some(s => s.disponivel)) return indisponivelHtml(serie[0] || {}, opcoes.causa);
  const maximo = Math.max(...validos.map(s => s.taxa), 0.0001);
  const atencao = [];
  if(serie.some(s => s.info && !s.info.ano_completo)) atencao.push("Barras listradas são períodos parciais: a taxa é menor porque cobre menos meses, não porque houve queda.");
  if(serie.some(s => s.pop?.defasado)) atencao.push("População com o ano entre parênteses: não há estimativa oficial para o ano dos eventos; foi usado o Censo indicado.");
  return `<div class="table-wrap"><table class="tabela-serie">
      <caption>${h(ev.rotulo)} e taxa por 100 mil habitantes por ano</caption>
      <thead><tr><th scope="col">Ano</th><th scope="col" class="num">Taxa</th><th scope="col"><span class="sr-only">Gráfico da taxa</span></th><th scope="col" class="num">${h(ev.rotulo)}</th><th scope="col" class="num">População</th><th scope="col">Período coberto</th></tr></thead>
      <tbody>${serie.map(s => {
        if(!s.disponivel) return `<tr><td>${h(s.ano)}</td><td colspan="5">indisponível</td></tr>`;
        const parcial = !s.info.ano_completo;
        return `<tr${s.ano === sel.ano ? ' class="linha-atual"' : ""}><td><a href="${h(linkPara({ ano: s.ano }))}">${h(s.ano)}</a></td>
          <td class="num"><strong>${fmtValor(s.taxa)}</strong></td>
          <td class="col-barra"><span class="b-trilho"><span class="b-barra${parcial ? " parcial" : ""}" style="width:${s.taxa == null ? 0 : Math.max(1.5, 100 * s.taxa / maximo)}%"></span></span></td>
          <td class="num">${fmtNum.format(s.n)}</td>
          <td class="num">${s.pop ? fmtNum.format(s.pop.valor) + (s.pop.defasado ? ` <small>(${h(s.pop.ano)})</small>` : "") : "—"}</td>
          <td>${h(s.info.periodo)}</td></tr>`;
      }).join("")}</tbody></table></div>
    ${atencaoHtml(atencao)}`;
}

async function renderCausasMunicipio(token = renderToken){
  const el = $("munCausas");
  if(!el) return;
  const ev = EVENTOS[sel.evento];
  if(sel.evento === "dengue"){
    el.innerHTML = `<div class="estado estado-indisponivel"><p>As notificações integradas são apenas de dengue; não há outras causas para listar neste tipo de evento.</p></div>`;
    return;
  }
  const niveis = sel.evento === "obitos" ? [["capitulo", "Capítulos"], ["grupo", "Grupos"], ["categoria", "Doenças"]] : [["capitulo", "Capítulos"]];
  if(!niveis.some(n => n[0] === nivelCausas)) nivelCausas = "capitulo";
  let itens;
  try{ itens = await principaisCausas(sel.mun, sel.evento, sel.ano, nivelCausas); }
  catch(erro){ el.innerHTML = erroHtml(erro); return; }
  if(token !== renderToken) return;
  el.innerHTML = cartao({
    titulo: "",
    descricao: `${h(rotuloPeriodo(sel.evento, sel.ano))} · clique numa causa para analisá-la`,
    acoes: niveis.length > 1 ? `<div class="segmentos" role="group" aria-label="Nível de detalhe">${niveis.map(([id, t]) => `<button type="button" aria-pressed="${id === nivelCausas}" data-nivel="${id}">${h(t)}</button>`).join("")}</div>` : "",
    rodape: linhaFonte(sel.evento, sel.ano),
    corpo: `${itens.length ? tabelaHtml(
      [{ t:"Causa" }, { t: ev.rotulo, num:true }, { t:"Parte do total", num:true }, { t:"Taxa por 100 mil", num:true }, { t:`Em relação ao estado (${ufDe(sel.mun)})` }],
      itens.map(i => [
        `<a href="${h(linkPara({ causa: i.causa.id, visao:"" }))}">${h(i.causa.rotulo)}</a>`,
        fmtNum.format(i.n), i.participacao == null ? "—" : fmtPct.format(i.participacao), fmtValor(i.taxa), statusHtml(i.comparacao)
      ]), { legenda:`${itens.length} causas com mais registros` })
      : `<div class="estado estado-indisponivel"><p>Nenhum registro neste período no arquivo publicado. Ausência de registro não é o mesmo que ausência de doença.</p></div>`}
    <p class="apoio">“Parte do total” é a participação de cada causa nos ${h(ev.plural)} ${nivelCausas === "capitulo" ? "do município" : "listados neste nível"} no período; não é taxa por população.
    ${sel.evento === "obitos" ? "Causas externas e causas mal definidas não são doenças." : ""}</p>
    ${atencaoHtml([alertaPeriodo(sel.evento, sel.ano)].filter(Boolean))}` });
  el.querySelectorAll("[data-nivel]").forEach(b => b.addEventListener("click", () => { nivelCausas = b.dataset.nivel; renderCausasMunicipio(); }));
  const resumo = $("munCausasResumo");
  if(resumo && itens.length) resumo.textContent = `${itens.length} causas · a primeira é ${itens[0].causa.curto.toLowerCase()} (${fmtPct.format(itens[0].participacao ?? 0)} do total)`;
}

function exportarMunicipio(analise, serie){
  const linhas = [["local", "codigo_ibge", "evento", "causa", "ano", "periodo", "eventos", "populacao", "populacao_referencia", "taxa_por_100mil", "situacao"]];
  const ev = EVENTOS[analise.evento];
  const causa = analise.evento === "dengue" ? "Dengue (A90, A91, A97)" : analise.causa.rotulo;
  for(const s of serie){
    for(const r of s.disponivel ? [s, ...(s.refs || [])] : []){
      linhas.push([nomeLocal(r.local), ehMunicipio(r.local) ? r.local : "", ev.rotulo, causa, s.ano, s.info.periodo, r.n, r.pop?.valor ?? "", r.pop?.origem ?? "sem população",
        r.taxa == null ? "" : decimalCSV(r.taxa), s.info.ano_completo ? "ano completo" : "período parcial"]);
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
  const cheio = locais.length >= 6;
  el.innerHTML = `
    ${cabecalhoComparar("locais", `Mesma doença em lugares diferentes · ${h(tituloCausa(sel.evento, causa))} · ${h(rotuloPeriodo(sel.evento, sel.ano))}`)}
    <div class="grade grade-lateral">
      <aside class="cartao painel-lateral no-print" aria-label="Locais comparados">
        <header class="cartao-cab"><div><h2 class="cartao-titulo">Locais</h2><p class="cartao-descricao">De 2 a 6 municípios ou estados.</p></div></header>
        <div class="cartao-corpo">
          <div class="combo">
            <label for="cmpLocal" class="campo-rotulo">Adicionar${cheio ? " (limite atingido)" : ""}</label>
            <input id="cmpLocal" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="cmpLista" autocomplete="off" placeholder="Ex.: Recife, Bahia" ${cheio ? "disabled" : ""} />
            <ul id="cmpLista" class="combo-list" role="listbox" aria-label="Locais encontrados" hidden></ul>
          </div>
          <ul class="selecionados">${locais.map(l => `<li><span>${h(nomeLocal(l))}</span><button type="button" class="remover" data-remover="${h(l)}" aria-label="Remover ${h(nomeLocal(l))}">×</button></li>`).join("")}</ul>
        </div>
        <footer class="cartao-rodape">Doença e ano: nos filtros, no alto da página.</footer>
      </aside>
      <div id="cmpResultado" class="grade-col"></div>
    </div>`;
  const adicionar = local => { if(local && !sel.comparar.includes(local) && sel.comparar.length < 6) navegar({ comparar: [...sel.comparar, local] }); };
  criarCombobox($("cmpLocal"), $("cmpLista"), opcoesLocal, item => adicionar(item.valor), { limparAoEscolher:true });
  el.querySelectorAll("[data-remover]").forEach(b => b.addEventListener("click", () => navegar({ comparar: sel.comparar.filter(l => l !== b.dataset.remover) })));

  const saida = $("cmpResultado");
  if(!locais.length){
    saida.innerHTML = `<div class="estado estado-vazio"><p>Adicione pelo menos dois locais.</p>
      ${sel.mun ? `<button class="btn-sec" type="button" id="cmpSugestao">Começar com ${h(nomeLocal(sel.mun))} e o estado</button>` : ""}</div>`;
    $("cmpSugestao")?.addEventListener("click", () => navegar({ comparar: [sel.mun, ufDe(sel.mun)] }));
    return;
  }
  saida.innerHTML = carregandoHtml("Calculando a comparação...");
  let analises;
  try{
    analises = await Promise.all([...locais, "BR"].map(l => analisar(l, { causa, evento: sel.evento, ano: sel.ano, sexo: sel.sexo, idade: sel.idade })));
  }catch(erro){ if(token === renderToken) saida.innerHTML = erroHtml(erro); return; }
  if(token !== renderToken) return;
  if(!analises[0].disponivel){ saida.innerHTML = indisponivelHtml(analises[0], causa); return; }
  const ic = a => a.pop && a.n != null ? intervaloPoisson(a.n).map(v => v / a.pop.valor * POR) : null;
  const municipios = locais.filter(ehMunicipio);
  const indicadores = base.dicionario.indicadores.filter(i => i.id !== "area_km2");
  const atencao = [alertaPeriodo(sel.evento, sel.ano)];
  if(analises.some(a => !a.pop)) atencao.push("Há local sem população publicada neste ano: a taxa dele não foi calculada.");
  saida.innerHTML = `
    ${atencaoHtml(atencao.filter(Boolean))}
    ${cartao({
      titulo: `${h(ev.taxa)} por 100 mil habitantes`,
      descricao: "Ao lado de cada taxa, o intervalo de 95%. Se as faixas se sobrepõem, a diferença pode ser acaso.",
      corpo: barrasHtml(analises.map(a => {
        const faixa = ic(a);
        return { nome: h(a.local === "BR" ? "Brasil (referência)" : nomeLocal(a.local)), valor: a.taxa,
          texto: a.taxa == null ? "sem população" : `${fmtValor(a.taxa)} <small>${faixa ? `${fmtValor(faixa[0])} a ${fmtValor(faixa[1])}` : ""}</small>`, destaque: a.local !== "BR" };
      }))
    })}
    ${cartao({ id:"cmpTend", titulo:"Evolução por ano", corpo: carregandoHtml("Calculando a série por ano...") })}
    <section class="cartao cartao-detalhes" aria-label="Mais informações"><div class="cartao-corpo">
      ${mais("Tabela e exportação", `
        ${tabelaHtml([{ t:"Local" }, { t: ev.rotulo, num:true }, { t:"População", num:true }, { t:"Taxa por 100 mil", num:true }, { t:"Intervalo de 95%", num:true }],
          analises.map(a => { const f = ic(a); return [h(nomeLocal(a.local)), fmtNum.format(a.n), a.pop ? fmtNum.format(a.pop.valor) : "sem população", fmtValor(a.taxa), f ? `${fmtValor(f[0])} a ${fmtValor(f[1])}` : "—"]; }),
          { legenda:`${ev.taxa}: mesma medida, período e filtros para todos os locais` })}
        <p>${h(GLOSSARIO.taxa)} ${h(GLOSSARIO.ic)}</p>
        <button id="cmpCsv" class="btn-sec no-print" type="button">Exportar CSV</button>
        ${linhaFonte(sel.evento, sel.ano)}`)}
      ${municipios.length ? mais(`Indicadores do território dos municípios (${indicadores.length})`, `
        <p class="apoio">Somente municípios: estes indicadores não são atribuídos de estados para municípios nem o contrário.</p>
        ${tabelaHtml([{ t:"Indicador" }, { t:"Ano" }, ...municipios.map(l => ({ t: nomeLocal(l), num:true })), { t:"Brasil", num:true }],
          indicadores.map(i => [`${h(i.nome)} <small>(${h(i.unidade)})</small>`, String(i.ano),
            ...municipios.map(l => { const v = base.indicadores.get(l)?.[i.id]; return v == null ? h(motivoSemIndicador(l, i.id)) : fmtValor(v, i.casas); }),
            `${fmtValor(i.ref.BR, i.casas)}${i.ref_tipo.startsWith("mediana") ? " <small>(mediana)</small>" : ""}`]),
          { legenda:"Indicadores territoriais dos municípios comparados" })}`) : ""}
    </div></section>`;
  Promise.all([...locais, "BR"].map(l => serieAnual(l, { causa, evento: sel.evento, ano: sel.ano, sexo: sel.sexo, idade: sel.idade })))
    .then(series => {
      const alvo = $("cmpTend")?.querySelector(".cartao-corpo");
      if(token !== renderToken || !alvo) return;
      const svg = tendenciaSvg(series.map((serie, i) => ({
        nome: i === locais.length ? "Brasil" : nomeLocal(locais[i]), ref: i === locais.length,
        pontos: serie.map(s => ({ ano: s.ano, valor: s.disponivel ? s.taxa ?? null : null, parcial: !s.info?.ano_completo }))
      })), { titulo:`${ev.taxa} por ano`, categorica:true });
      if(svg) alvo.innerHTML = svg; else $("cmpTend").remove();
    }).catch(erro => { console.error(erro); $("cmpTend")?.remove(); });
  $("cmpCsv").addEventListener("click", () => baixarCSV(`comparacao_${sel.evento}_${sel.ano}.csv`,
    [["local", "eventos", "populacao", "taxa_por_100mil"], ...analises.map(a => [nomeLocal(a.local), a.n, a.pop?.valor ?? "", a.taxa == null ? "" : decimalCSV(a.taxa)])],
    notasExportacao(sel.evento, causa, sel.ano)));
}

/* ============================================================
   Comparar: cabeçalho com as duas formas de comparação
   ============================================================ */
function cabecalhoComparar(ativo, contexto = ""){
  const abas = [
    ["locais", "Entre municípios e estados", linkPara({ rota:"comparar", modoCmp:"" })],
    ["doencas", "Entre doenças", linkPara({ rota:"comparar", modoCmp:"doencas" })]
  ];
  return `${cabecalhoPagina({ titulo:"Comparar", contexto })}
    <nav class="abas no-print" aria-label="Tipo de comparação">${abas.map(([id, t, link]) =>
      `<a href="${h(link)}"${id === ativo ? ' aria-current="page"' : ""}>${h(t)}</a>`).join("")}</nav>`;
}

/* ============================================================
   Comparar doenças num mesmo local (até 6)
   ============================================================ */
const SUGESTOES_CMP_DOENCAS = ["g:I20-I25", "g:I60-I69", "g:C00-C97", "g:E10-E14", "g:J09-J18"];

async function renderCompararDoencas(el, token){
  const local = sel.localCmp || "BR";
  const ev = EVENTOS[sel.evento];
  const causas = sel.causasCmp.map(lerCausa);
  const cheio = causas.length >= 6;
  el.innerHTML = `
    ${cabecalhoComparar("doencas", `Várias doenças no mesmo lugar · ${h(ev.taxa)} · ${h(rotuloPeriodo(sel.evento, sel.ano))}`)}
    <div class="grade grade-lateral">
      <aside class="cartao painel-lateral no-print" aria-label="O que comparar">
        <div class="cartao-corpo">
          <div class="combo">
            <label for="cdLocal" class="campo-rotulo">Onde</label>
            <input id="cdLocal" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="cdLocalLista" autocomplete="off" placeholder="Brasil" value="${h(local === "BR" ? "" : nomeLocal(local))}" />
            <ul id="cdLocalLista" class="combo-list" role="listbox" aria-label="Locais encontrados" hidden></ul>
            ${local === "BR" ? "" : `<button class="link-button" type="button" id="cdBrasil">Voltar para o Brasil</button>`}
          </div>
          <div class="combo">
            <label for="cdCausa" class="campo-rotulo">Doenças${cheio ? " (limite de 6)" : " (até 6)"}</label>
            <input id="cdCausa" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="cdCausaLista" autocomplete="off" placeholder="Ex.: infarto, diabetes, AVC" ${cheio ? "disabled" : ""} />
            <ul id="cdCausaLista" class="combo-list" role="listbox" aria-label="Doenças encontradas" hidden></ul>
          </div>
          <ul class="selecionados">${causas.map(c => `<li><span>${h(c.curto)}</span><button type="button" class="remover" data-remover="${h(c.id)}" aria-label="Remover ${h(c.curto)}">×</button></li>`).join("")}</ul>
        </div>
        <footer class="cartao-rodape">Registro e ano: nos filtros, no alto da página.</footer>
      </aside>
      <div id="cdResultado" class="grade-col"></div>
    </div>`;

  criarCombobox($("cdLocal"), $("cdLocalLista"), texto => [{ valor:"BR", titulo:"Brasil", detalhe:"país", texto:"Brasil" }, ...opcoesLocal(texto)].filter((o, i) => i > 0 || !texto || "brasil".startsWith(normText(texto))),
    item => navegar({ localCmp: item.valor }));
  $("cdBrasil")?.addEventListener("click", () => navegar({ localCmp:"BR" }));
  const adicionar = id => { if(id && id !== "todas" && !sel.causasCmp.includes(id) && sel.causasCmp.length < 6) navegar({ causasCmp: [...sel.causasCmp, id] }); };
  criarCombobox($("cdCausa"), $("cdCausaLista"), texto => opcoesCausa(texto).filter(o => o.valor !== "todas"), item => adicionar(item.valor), { limparAoEscolher:true });
  el.querySelectorAll("[data-remover]").forEach(b => b.addEventListener("click", () => navegar({ causasCmp: sel.causasCmp.filter(c => c !== b.dataset.remover) })));

  const saida = $("cdResultado");
  if(sel.evento === "dengue"){
    saida.innerHTML = `<div class="estado estado-vazio"><p>Dengue é uma doença só. Para comparar doenças, troque o registro para óbitos ou internações nos filtros acima.</p></div>`;
    return;
  }
  if(causas.length < 2){
    saida.innerHTML = `<div class="estado estado-vazio">
      <p>Escolha pelo menos duas doenças, ou comece por um exemplo:</p>
      <button class="btn-sec" type="button" id="cdExemplo">Coração, AVC, câncer, diabetes e pneumonia</button></div>`;
    $("cdExemplo").addEventListener("click", () => navegar({ causasCmp: SUGESTOES_CMP_DOENCAS }));
    return;
  }

  saida.innerHTML = carregandoHtml("Calculando...");
  let analises;
  try{
    analises = await Promise.all(causas.map(causa => analisar(local, { causa, evento: sel.evento, ano: sel.ano })));
  }catch(erro){ if(token === renderToken) saida.innerHTML = erroHtml(erro); return; }
  if(token !== renderToken) return;

  const validas = analises.filter(a => a.disponivel && a.taxa != null).sort((a, b) => b.taxa - a.taxa);
  const fora = analises.filter(a => !(a.disponivel && a.taxa != null));
  const lider = validas[0], ultimo = validas[validas.length - 1];
  const vezes = lider && ultimo && ultimo.taxa > 0 ? lider.taxa / ultimo.taxa : null;
  const situacao = a => {
    const c = a.padronizado && a.padronizado.classe !== "indisponivel" ? a.padronizado : a.comparacao;
    if(!c || c.classe === "indisponivel" || local === "BR") return "";
    return statusHtml(c);
  };
  const ref = ehMunicipio(local) ? `o estado (${ufDe(local)})` : "o Brasil";

  saida.innerHTML = `
    ${lider ? `<p class="cd-resumo">${h(nomeLocal(local))}: a maior taxa é de <strong>${h(lider.causa.curto.toLowerCase())}</strong>, com ${fmtValor(lider.taxa)} ${h(ev.plural)} por 100 mil habitantes${vezes && validas.length > 1 ? `, ${fmt1.format(vezes)} vezes a de ${h(ultimo.causa.curto.toLowerCase())}` : ""}.</p>` : ""}
    ${atencaoHtml([alertaPeriodo(sel.evento, sel.ano), ...fora.map(a => `${h(a.causa.curto)}: ${h(a.motivo || "sem dado para este recorte")}.`)].filter(Boolean))}
    ${cartao({ titulo:"Taxa por 100 mil habitantes", descricao: h(nomeLocal(local)), corpo: `
      ${barrasHtml(validas.map(a => ({ nome: `<a href="${h(linkPara({ rota: ehMunicipio(local) ? "municipio" : "doencas", mun: ehMunicipio(local) ? local : sel.mun, causa: a.causa.id, cid: a.causa.id }))}">${h(a.causa.curto)}</a>`,
        valor: a.taxa, texto: `${fmtValor(a.taxa)} <small>${fmtNum.format(a.n)} ${h(ev.plural)}</small>` })))}
      ${local !== "BR" ? `<h3 class="cd-sub">Em relação ao esperado para ${h(ref)}</h3>
        <ul class="cd-situacao">${validas.map(a => `<li><span>${h(a.causa.curto)}</span>${situacao(a) || "<small>sem base para comparar</small>"}</li>`).join("")}</ul>` : ""}` })}
    ${cartao({ id:"cdTend", titulo:"Evolução por ano", corpo: carregandoHtml("Calculando a série...") })}
    <section class="cartao cartao-detalhes" aria-label="Mais informações"><div class="cartao-corpo">
    ${mais("Tabela e exportação", `
      ${tabelaHtml([{ t:"Doença" }, { t:"Código CID-10" }, { t: ev.rotulo, num:true }, { t:"Taxa por 100 mil", num:true }],
        validas.map(a => [h(a.causa.curto), h(a.causa.codigo || ""), fmtNum.format(a.n), fmtValor(a.taxa)]),
        { legenda:`${nomeLocal(local)} · ${ev.taxa} · ${rotuloPeriodo(sel.evento, sel.ano)}` })}
      <p class="apoio">Cada doença é contada pela causa principal registrada. Grupos e capítulos podem se sobrepor (um capítulo inclui seus grupos), então os valores não devem ser somados.</p>
      <button id="cdCsv" class="btn-sec no-print" type="button">Exportar CSV</button>
      ${linhaFonte(sel.evento, sel.ano)}`)}
    </div></section>`;

  $("cdCsv").addEventListener("click", () => baixarCSV(`doencas_${normText(nomeLocal(local)).replace(/ /g, "_")}_${sel.evento}_${sel.ano}.csv`,
    [["doenca", "cid10", "eventos", "taxa_por_100mil"], ...validas.map(a => [a.causa.curto, a.causa.codigo || "", a.n, decimalCSV(a.taxa)])],
    notasExportacao(sel.evento, lerCausa("todas"), sel.ano)));

  Promise.all(validas.map(a => serieAnual(local, { causa: a.causa, evento: sel.evento, ano: sel.ano })))
    .then(series => {
      const alvo = $("cdTend")?.querySelector(".cartao-corpo");
      if(token !== renderToken || !alvo) return;
      const svg = tendenciaSvg(series.map((serie, i) => ({
        nome: validas[i].causa.curto,
        pontos: serie.map(s => ({ ano: s.ano, valor: s.disponivel ? s.taxa ?? null : null, parcial: !s.info?.ano_completo }))
      })), { titulo:`${ev.taxa} por ano`, categorica:true });
      if(svg) alvo.innerHTML = svg; else $("cdTend").remove();
    }).catch(erro => { console.error(erro); $("cdTend")?.remove(); });
}

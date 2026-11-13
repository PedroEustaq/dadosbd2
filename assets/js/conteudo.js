/* ============================================================
   Conteúdo: catálogo da CID-10, fatores e melhorias,
   fontes e metodologia
   ============================================================ */

/* ---------- Busca no catálogo ---------- */
let _indiceCid = null;
let _subcategorias = null;     // Map "I219" → {codigo, nome, ...} depois de carregar as 26 letras

function indiceCid(){
  if(_indiceCid) return _indiceCid;
  const cid = base.cid;
  _indiceCid = [
    ...cid.capitulos.map(c => ({ valor:`cap:${c.n}`, codigo:`${c.ini}–${c.fim}`, nome:`Capítulo ${c.rom} — ${c.nome}`, busca: normText(c.nome), tipo:"capítulo" })),
    ...cid.grupos.map(g => ({ valor:`g:${g.ini}-${g.fim}`, codigo:`${g.ini}–${g.fim}`, nome:g.nome, busca: normText(g.nome), tipo:"grupo" })),
    ...cid.categorias.map(([codigo, nome]) => ({ valor:`c:${codigo}`, codigo, nome, busca: normText(nome), tipo:"categoria" }))
  ];
  return _indiceCid;
}

async function carregarSubcategorias(){
  if(!_subcategorias){
    const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const arquivos = await Promise.all(letras.map(l => fetchJSON(PATHS.cidSub(l)).catch(() => ({}))));
    _subcategorias = new Map();
    for(const arquivo of arquivos){
      for(const lista of Object.values(arquivo)){
        for(const [codigo, nome, sexo, causaObito, sup] of lista){
          if(codigo.length < 4) continue;   // o arquivo repete a categoria quando ela não tem subdivisão
          _subcategorias.set(codigo, { codigo, nome, sexo, causaObito: Boolean(causaObito), sup: Boolean(sup), busca: normText(nome) });
        }
      }
    }
  }
  return _subcategorias;
}

/* Busca por código (com ou sem ponto), nome e termos populares, sem acentos. */
function buscarCid(texto, limite = 10, comSub = false){
  const q = normText(texto);
  if(!q) return [];
  const indice = indiceCid();
  const codigo = String(texto).toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const saida = [], vistos = new Set();
  const por = item => { if(item && !vistos.has(item.valor)){ vistos.add(item.valor); saida.push(item); } };

  if(/^[A-Z]\d{2}-[A-Z]\d{2}$/.test(codigo)) por(indice.find(i => i.valor === `g:${codigo}`));
  if(/^[A-Z]\d{1,3}$/.test(codigo)){
    const c3 = codigo.slice(0, 3);
    indice.filter(i => i.tipo === "categoria" && i.codigo.startsWith(c3)).slice(0, limite).forEach(por);
    if(comSub && _subcategorias && codigo.length >= 3){
      [..._subcategorias.values()].filter(s => s.codigo.startsWith(codigo)).slice(0, limite)
        .forEach(s => por({ valor:`s:${s.codigo}`, codigo:`${s.codigo.slice(0, 3)}.${s.codigo.slice(3)}`, nome:s.nome, tipo:"subcategoria" }));
    }
  }
  // Termos populares: o mais específico primeiro ("câncer de mama" antes de "câncer").
  base.conhecimento.termos_populares
    .map(t => ({ t, nota: t.termo === q ? 0 : t.termo.startsWith(q) ? 1 : (q.length >= 4 && t.termo.includes(q)) ? 2 : (q.length >= 4 && q.includes(t.termo)) ? 3 : -1 }))
    .filter(x => x.nota >= 0)
    .sort((a, b) => a.nota - b.nota || b.t.termo.length - a.t.termo.length)
    .forEach(({ t }) => {
      const item = indice.find(i => i.valor === t.sel);
      if(item) por({ ...item, popular: t.termo });
    });
  const palavras = q.split(" ");
  const casa = i => palavras.every(p => i.busca.includes(p));
  const ordem = { "capítulo":0, grupo:1, categoria:2 };
  indice.filter(casa).sort((a, b) => (a.busca.startsWith(q) ? 0 : 1) - (b.busca.startsWith(q) ? 0 : 1) || ordem[a.tipo] - ordem[b.tipo] || a.busca.length - b.busca.length)
    .slice(0, limite).forEach(por);
  if(comSub && _subcategorias && saida.length < limite && q.length >= 4){
    for(const s of _subcategorias.values()){
      if(saida.length >= limite * 2) break;
      if(palavras.every(p => s.busca.includes(p))) por({ valor:`s:${s.codigo}`, codigo:`${s.codigo.slice(0, 3)}.${s.codigo.slice(3)}`, nome:s.nome, tipo:"subcategoria" });
    }
  }
  return saida.slice(0, comSub ? limite * 2 : limite);
}

/* Opções para as caixas de busca (combobox). */
function opcoesMunicipio(texto){
  return buscarMunicipios(texto).map(m => ({ valor:m.c, titulo:m.n, detalhe:`${UF_NAMES[m.uf]} (${m.uf})`, texto:`${m.n} (${m.uf})` }));
}
function opcoesCausa(texto){
  const lista = buscarCid(texto, 10).map(i => ({ valor:i.valor, titulo:`${i.codigo} ${i.nome}`, detalhe: i.popular ? `${i.tipo} · termo popular “${i.popular}”` : i.tipo, texto:`${i.codigo} ${i.nome}` }));
  if("todas as causas".includes(normText(texto))) lista.unshift({ valor:"todas", titulo:"Todas as causas", detalhe:"total", texto:"Todas as causas" });
  return lista;
}
function opcoesLocal(texto){
  const q = normText(texto);
  const ufs = q ? ALL_UFS.filter(uf => normText(UF_NAMES[uf]).includes(q) || normText(uf) === q)
    .map(uf => ({ valor:uf, titulo:UF_NAMES[uf], detalhe:"estado", texto:UF_NAMES[uf] })) : [];
  return [...ufs.slice(0, 3), ...opcoesMunicipio(texto)].slice(0, 10);
}

/* ============================================================
   Doenças e CID
   Busca primeiro; a hierarquia fica num painel secundário.
   A ficha segue a mesma ordem do painel: números-chave,
   tendência e, por fim, detalhes sob demanda.
   ============================================================ */
let _buscaCid = "";
let _arvoreAberta = false;

async function renderDoencas(el, token){
  const meta = base.cid.meta;
  el.innerHTML = `
    <div class="pag-topo"><div>
      <h1 class="pag-titulo">Doenças e condições</h1>
      <p class="meta">CID-10 completa: ${fmtNum.format(meta.totais.capitulos)} capítulos, ${fmtNum.format(meta.totais.grupos)} agrupamentos, ${fmtNum.format(meta.totais.categorias)} categorias e ${fmtNum.format(meta.totais.subcategorias)} subcategorias</p>
    </div></div>
    <div class="busca-cid">
      <label for="cidBusca">Buscar por nome, código ou termo popular</label>
      <input id="cidBusca" type="search" autocomplete="off" placeholder="Ex.: infarto, pneumonia, derrame, I21.9" />
    </div>
    <div class="cid-layout${sel.cid ? " tem-ficha" : ""}">
      <div id="cidFicha" class="cid-ficha"></div>
      <aside class="cid-lado" aria-label="Resultados e classificação">
        <div id="cidLista" aria-live="polite"></div>
      </aside>
    </div>`;
  const busca = $("cidBusca");
  busca.value = _buscaCid;
  const listar = () => { _buscaCid = busca.value; renderListaCid(busca.value); };
  busca.addEventListener("input", debounce(listar, 120));
  listar();
  carregarSubcategorias().then(() => { if(token === renderToken && busca.value) listar(); });
  renderFichaCid(token);
}

function renderListaCid(texto){
  const el = $("cidLista");
  if(!el) return;
  if(normText(texto)){
    const resultados = buscarCid(texto, 20, true);
    el.innerHTML = `<h2 class="lado-titulo">Resultados</h2>${resultados.length ? `<ul class="lista-cid">${resultados.map(r =>
      `<li><a href="${h(linkPara({ rota:"doencas", cid:r.valor }))}"${r.valor === sel.cid ? ' aria-current="true"' : ""}><b>${h(r.codigo)}</b> <span>${h(r.nome)}</span> <small>${h(r.tipo)}${r.popular ? ` · “${h(r.popular)}”` : ""}</small></a></li>`).join("")}</ul>`
      : `<p class="apoio">Nenhum item encontrado para “${h(texto)}”. Tente outro nome ou o código.</p>`}`;
    return;
  }
  // Sem busca: sugestões rápidas e a hierarquia completa sob demanda.
  const vistos = new Set();
  const sugestoes = base.conhecimento.termos_populares.filter(t => !vistos.has(t.sel) && vistos.add(t.sel)).slice(0, 10);
  el.innerHTML = `<h2 class="lado-titulo">Buscas frequentes</h2>
    <ul class="sugestoes">${sugestoes.map(t => `<li><a href="${h(linkPara({ rota:"doencas", cid:t.sel }))}"${t.sel === sel.cid ? ' aria-current="true"' : ""}>${h(t.termo)}</a></li>`).join("")}</ul>
    <button id="arvoreBtn" class="btn-sec" type="button" aria-expanded="${_arvoreAberta}" aria-controls="arvore">${_arvoreAberta ? "Ocultar a classificação" : "Navegar pela classificação"}</button>
    <div id="arvore" class="arvore-lista"${_arvoreAberta ? "" : " hidden"}></div>`;
  const montar = () => {
    const arv = $("arvore");
    if(arv.dataset.pronto) return;
    arv.dataset.pronto = "1";
    arv.innerHTML = base.cid.capitulos.map(cap =>
      `<details class="arvore" data-cap="${cap.n}"><summary><b>${h(cap.rom)}</b> ${h(cap.nome)} <small>${h(cap.ini)}–${h(cap.fim)}</small></summary><div class="arvore-corpo"></div></details>`).join("");
    arv.querySelectorAll("details.arvore").forEach(d => d.addEventListener("toggle", () => {
      const corpo = d.querySelector(".arvore-corpo");
      if(!d.open || corpo.dataset.pronto) return;
      corpo.dataset.pronto = "1";
      const n = Number(d.dataset.cap);
      const especificos = new Set([...base.catPorCodigo.values()].map(c => c.grupo));
      corpo.innerHTML = `<p><a href="${h(linkPara({ rota:"doencas", cid:`cap:${n}` }))}">Ver o capítulo inteiro</a></p>` + base.cid.grupos.map((g, i) => ({ g, i })).filter(x => x.g.cap === n).map(({ g, i }) => {
        const cats = especificos.has(i) ? base.cid.categorias.filter(c => c[2] === i) : [];
        return `<details class="arvore nivel2"><summary><b>${h(g.ini)}–${h(g.fim)}</b> ${h(g.nome)}${cats.length ? "" : " <small>(agrupamento amplo)</small>"}</summary>
          <ul class="lista-cid"><li><a href="${h(linkPara({ rota:"doencas", cid:`g:${g.ini}-${g.fim}` }))}"><span>Ver o agrupamento inteiro</span></a></li>${cats.map(c => `<li><a href="${h(linkPara({ rota:"doencas", cid:`c:${c[0]}` }))}"><b>${h(c[0])}</b> <span>${h(c[1])}</span></a></li>`).join("")}</ul></details>`;
      }).join("");
    }));
  };
  if(_arvoreAberta) montar();
  $("arvoreBtn").addEventListener("click", () => {
    _arvoreAberta = !_arvoreAberta;
    $("arvore").hidden = !_arvoreAberta;
    $("arvoreBtn").setAttribute("aria-expanded", String(_arvoreAberta));
    $("arvoreBtn").textContent = _arvoreAberta ? "Ocultar a classificação" : "Navegar pela classificação";
    if(_arvoreAberta) montar();
  });
}

async function renderFichaCid(token){
  const el = $("cidFicha");
  if(!el) return;
  if(!sel.cid){
    el.innerHTML = `<div class="estado estado-vazio"><h2>Escolha uma doença ou condição</h2>
      <p>Busque pelo nome que você conhece ou escolha uma das buscas frequentes. A ficha mostra os números do Brasil, a evolução, o que se sabe sobre riscos e prevenção e como analisar no seu município.</p>
      <p class="apoio">A CID também classifica sintomas, lesões, causas externas e motivos de contato com serviços de saúde, que não são doenças. Ter um código no catálogo não significa que existam dados locais para ele: cada ficha mostra o que há.</p></div>`;
    return;
  }
  let sub = null, causa;
  if(sel.cid.startsWith("s:")){
    const subs = await carregarSubcategorias();
    if(token !== renderToken) return;
    sub = subs.get(sel.cid.slice(2));
    if(!sub){ el.innerHTML = `<div class="estado estado-indisponivel"><p>Código não encontrado no catálogo.</p></div>`; return; }
    causa = lerCausa(`c:${sub.codigo.slice(0, 3)}`);
  }else causa = lerCausa(sel.cid);
  if(causa.tipo === "todas"){ el.innerHTML = `<div class="estado estado-indisponivel"><p>Código não encontrado no catálogo.</p></div>`; return; }
  const cap = base.cid.capitulos[causa.cap - 1];
  const cat = causa.tipo === "c" ? base.catPorCodigo.get(causa.ini) : null;
  const grupo = cat ? base.cid.grupos[cat.grupo] : null;
  const trilha = [`<a href="${h(linkPara({ rota:"doencas", cid:`cap:${cap.n}` }))}">Cap. ${h(cap.rom)} — ${h(cap.nome)}</a>`];
  if(grupo) trilha.push(`<a href="${h(linkPara({ rota:"doencas", cid:`g:${grupo.ini}-${grupo.fim}` }))}">${h(grupo.ini)}–${h(grupo.fim)} ${h(grupo.nome)}</a>`);
  if(sub) trilha.push(`<a href="${h(linkPara({ rota:"doencas", cid:causa.id }))}">${h(causa.rotulo)}</a>`);
  const codigo = sub ? `${sub.codigo.slice(0, 3)}.${sub.codigo.slice(3)}` : causa.codigo;
  const nome = sub ? sub.nome : causa.curto;
  const suplemento = sub ? sub.sup : cat?.sup;
  const temas = temasDaCausa(causa);
  const nivel = sub ? "Subcategoria" : { cap:"Capítulo", g:"Agrupamento", c:"Categoria" }[causa.tipo];
  const avisos = [
    cap.tipo !== "doença" ? `Este item não é propriamente uma doença: ${h(cap.tipo)}.` : "",
    sub ? `Os dados municipais vão até a categoria ${h(causa.codigo)}. Para esta subcategoria há apenas totais do Brasil.` : "",
    sub && !sub.causaObito ? "Segundo a tabela do DATASUS, esta subcategoria não deve ser usada como causa básica de óbito." : ""
  ].filter(Boolean);

  el.innerHTML = `<article class="ficha" aria-labelledby="fichaTitulo">
      <nav class="trilha" aria-label="Posição na classificação">${trilha.join(' <span aria-hidden="true">›</span> ')}</nav>
      <h2 id="fichaTitulo" class="ficha-titulo"><span class="codigo">${h(codigo)}</span> ${h(nome)}</h2>
      <p class="meta">${h(nivel)} da CID-10</p>
      <div class="acoes no-print">
        <a class="btn" href="${h(linkPara({ rota: sel.mun ? "municipio" : "mapa", causa: causa.id, evento:"obitos", visao:"" }))}">${sel.mun ? `Analisar em ${h(nomeLocal(sel.mun))}` : "Ver no mapa do Brasil"}</a>
        ${sel.mun ? `<a class="btn-sec" href="${h(linkPara({ rota:"mapa", causa: causa.id, evento:"obitos" }))}">Ver no mapa</a>` : `<button class="btn-sec" type="button" onclick="navegar({ rota:'municipio', causa:'${h(causa.id)}', evento:'obitos' })">Analisar em um município</button>`}
      </div>
      <div id="cidKpis">${carregandoHtml("Somando os registros do Brasil...")}</div>
      ${atencaoHtml(avisos)}
      <div id="cidTend"></div>
      <section class="bloco" aria-labelledby="riscoTitulo">
        <h3 id="riscoTitulo">Riscos e prevenção ${rot("literatura")}</h3>
        ${temas.length ? temas.map(t => temaHtml(t.tema, t.relacao)).join("")
          : `<p><strong>Sem conteúdo explicativo revisado para este código.</strong> O painel mostra só os números quando não há texto revisado; nada é preenchido automaticamente.</p>`}
      </section>
      <div id="cidDetalhes"></div>
    </article>`;

  try{
    const anos = anosDe("obitos");
    const porAno = await Promise.all(anos.map(a => simUFs(a)));
    if(token !== renderToken) return;
    const ano = anos.includes(sel.ano) ? sel.ano : anos[anos.length - 1];
    const dados = anos.map((a, i) => {
      const br = porAno[i].get("BR");
      const n = sub ? (br.cid4.get(sub.codigo) || 0) : contarCausa(br.cid3, causa);
      const ufs = ALL_UFS.filter(uf => sub ? porAno[i].get(uf)?.cid4.get(sub.codigo) : contarCausa(porAno[i].get(uf)?.cid3, causa)).length;
      const info = infoAno("obitos", a);
      return { ano:a, n, taxa: taxa(n, popDe("BR", a)?.valor), ufs, info };
    });
    const atual = dados.find(d => d.ano === ano);
    const dispSih = disponibilidade("internacoes", causa), dispDengue = disponibilidade("dengue", causa);

    // TOPO: números-chave
    $("cidKpis").innerHTML = kpisHtml([
      { rotulo:`Óbitos no Brasil em ${h(ano)}`, tom:"principal", valor: fmtNum.format(atual.n), nota: atual.info.ano_completo ? "ano completo" : `período parcial: ${h(atual.info.periodo)}` },
      { rotulo:"Taxa do Brasil", valor: fmtValor(atual.taxa), nota:"óbitos por 100 mil habitantes" },
      { rotulo:"Estados com registro", valor:`${atual.ufs} <small>de 27</small>`, nota: atual.n ? "" : "zero registros não prova ausência" },
      { rotulo:"Dados municipais", valor: sub ? "não" : "sim", nota: sub ? `use a categoria ${h(causa.codigo)}` : `óbitos${dispSih.ok ? ", internações" : ""}${dispDengue.ok ? ", notificações" : ""}` }
    ]);

    // MEIO: tendência no Brasil
    $("cidTend").innerHTML = `<section class="bloco"><h3>Evolução no Brasil</h3>
      ${tendenciaSvg([{ nome:"Brasil", pontos: dados.map(d => ({ ano:d.ano, valor:d.taxa, parcial:!d.info.ano_completo })) }],
        { titulo:"Taxa de mortalidade no Brasil por ano", unidade:"Óbitos por 100 mil habitantes, por causa básica" })}</section>`;

    // BASE: detalhes sob demanda
    let subsHtml = "";
    if(causa.tipo === "c"){
      const subs = await carregarSubcategorias();
      if(token !== renderToken) return;
      const brSub = porAno[anos.indexOf(ano)].get("BR").cid4;
      const lista = [...subs.values()].filter(s => s.codigo.startsWith(causa.ini));
      const foraDoCatalogo = [...brSub.keys()].filter(c => c.length === 4 && c.startsWith(causa.ini) && !subs.has(c));
      const semDetalhe = brSub.get(causa.ini) || 0;
      subsHtml = lista.length || foraDoCatalogo.length ? mais(`Subcategorias (${lista.length + foraDoCatalogo.length})`, tabelaHtml([{ t:"Código" }, { t:"Nome" }, { t:`Óbitos no Brasil em ${ano}`, num:true }], [
          ...lista.map(s => [`<a href="${h(linkPara({ rota:"doencas", cid:`s:${s.codigo}` }))}">${h(s.codigo.slice(0, 3))}.${h(s.codigo.slice(3))}</a>`, h(s.nome) + (s.sup ? " <small>(suplemento)</small>" : ""), fmtNum.format(brSub.get(s.codigo) || 0)]),
          ...foraDoCatalogo.map(c => [`${h(c.slice(0, 3))}.${h(c.slice(3))}`, "<em>Usada no SIM, mas ausente da edição de 2008 do catálogo</em>", fmtNum.format(brSub.get(c))]),
          ...(semDetalhe && lista.length ? [[h(causa.ini), "<em>Registrados só com a categoria (sem quarto caractere)</em>", fmtNum.format(semDetalhe)]] : [])
        ], { legenda:"A soma das subcategorias é igual ao total da categoria: não some os dois." })) : "";
    }
    $("cidDetalhes").innerHTML = `
      ${mais("Dados disponíveis por fonte e ano", `
        ${tabelaHtml([{ t:"Ano" }, { t:"Período" }, { t:"Óbitos no Brasil", num:true }, { t:"Taxa por 100 mil", num:true }, { t:"Estados com registro" }],
          dados.map(d => [h(d.ano), h(d.info.periodo), fmtNum.format(d.n), fmtValor(d.taxa), `${d.ufs} de 27`]), { legenda:"Óbitos (SIM) por causa básica" })}
        <ul>
          <li><strong>Óbitos (SIM):</strong> ${sub ? "Brasil" : "por município, estado e Brasil"}, ${anos[0]}–${anos[anos.length - 1]}. Zero significa nenhum registro com esta causa básica, não ausência da condição.</li>
          <li><strong>Internações no SUS (SIH):</strong> ${dispSih.ok && !sub ? "disponíveis por município para este capítulo." : `não disponíveis neste nível. ${h(dispSih.motivo || "As internações foram importadas apenas por capítulo.")} <a href="${h(linkPara({ rota:"doencas", cid:`cap:${causa.cap}` }))}">Ver o capítulo</a>.`}</li>
          <li><strong>Notificações (SINAN):</strong> ${dispDengue.ok ? "casos prováveis de dengue por município." : "não importadas para este item (apenas dengue foi integrada)."}</li>
          <li><strong>Incidência (casos novos):</strong> não disponível em nenhuma das fontes integradas.</li>
        </ul>${linhaFonte("obitos", ano)}`)}
      ${subsHtml}
      ${mais("Sobre a classificação", `
        <p>${h(nivel)} da CID-10, capítulo ${h(cap.rom)} (${h(cap.ini)}–${h(cap.fim)}), natureza: ${h(cap.tipo)}.</p>
        ${suplemento ? `<p>Código criado pela OMS depois da edição de 2008 usada no catálogo. Nome em tradução livre do projeto, a partir da versão 2019 da CID-10.</p>` : ""}
        ${sub?.sexo ? `<p>Código restrito ao sexo ${sub.sexo === "F" ? "feminino" : "masculino"}.</p>` : ""}
        <p>${h(base.cid.meta.edicao)} · origem: ${h(base.cid.meta.origem)} · arquivos de ${h(formatarData(base.cid.meta.data_dos_arquivos_na_fonte))}, coletados em ${h(formatarData(base.cid.meta.coletado_em))}. Outras versões (como a CID-11) não estão carregadas.</p>
        <p>${h(base.conhecimento.aviso_termos)}</p>`)}`;
  }catch(erro){ if(token === renderToken) $("cidKpis").innerHTML = erroHtml(erro); }
}

function temaHtml(tema, relacao){
  return `<div class="tema">
    <h4>${h(tema.nome)}</h4>
    ${relacao === "parcial" ? `<p class="apoio">Este texto vale para uma parte do item selecionado (CID-10 ${tema.cid.map(c => h(c.replace("-", "–"))).join(", ")}).</p>` : ""}
    <p>${h(tema.descricao)}</p>
    ${tema.transmissao ? `<p><strong>Transmissão:</strong> ${h(tema.transmissao)}</p>` : ""}
    <div class="duas-listas">
      <div><h5>Fatores de risco</h5><ul>${tema.risco.map(r => `<li>${h(r)}</li>`).join("")}</ul></div>
      <div><h5>Prevenção</h5><ul>${tema.prevencao.map(r => `<li>${h(r)}</li>`).join("")}</ul></div>
    </div>
    ${mais(`Referências (${tema.refs.length})`, refsHtml(tema.refs))}
  </div>`;
}

/* ============================================================
   Fatores e melhorias
   ============================================================ */
const TIPOS_ACAO = { poder_publico:"Poder público", comunidade:"Comunidade", populacao:"Orientações gerais" };
const SITUACAO_FATOR = {
  atencao: { texto:"Merece atenção", classe:"situ-atencao", simbolo:"▲" },
  intermediario: { texto:"Faixa intermediária na UF", classe:"", simbolo:"" },
  favoravel: { texto:"Menos desfavorável que a maioria da UF", classe:"", simbolo:"" },
  sem_dado: { texto:"Sem valor local", classe:"situ-sem", simbolo:"" }
};

/* Lista plana de indicadores ligados à causa, sem repetição, com o valor local e a situação. */
function fatoresDaCausa(mun, causa){
  const porId = new Map();
  for(const { tema, relacao } of temasDaCausa(causa)){
    for(const fator of tema.fatores){
      const def = base.indPorId.get(fator.indicador);
      if(!def) continue;
      if(!porId.has(def.id)){
        const ind = indicadorLocal(mun, def.id);
        porId.set(def.id, { id:def.id, def, ind, atencao: atencaoFator(ind, fator.atencao), fator, temas:[], acoes:new Set(), refs:new Set() });
      }
      const item = porId.get(def.id);
      item.temas.push({ tema, relacao });
      fator.acoes.forEach(a => item.acoes.add(a));
      fator.refs.forEach(r => item.refs.add(r));
    }
  }
  return [...porId.values()];
}

function situacaoHtml(at){
  const s = SITUACAO_FATOR[at.nivel] || SITUACAO_FATOR.sem_dado;
  return `<span class="situ ${s.classe}">${s.simbolo ? `<span aria-hidden="true">${s.simbolo}</span> ` : ""}${h(s.texto)}</span>`;
}

function fatorHtml(f, mun, causaFatores){
  const { def, ind, atencao: at, fator } = f;
  const uf = ufDe(mun);
  const defasagem = Number(sel.ano) - def.ano;
  const acoes = [...f.acoes].map(id => ({ id, ...base.conhecimento.acoes[id] })).filter(a => a.texto);
  const valor = ind.disponivel
    ? `<span class="f-valor">${fmtValor(ind.valor, def.casas)} <small>${h(def.unidade)}</small></span>`
    : `<span class="f-valor f-sem">—</span>`;
  const detalhe = `
    ${ind.disponivel ? `<p>${rot("fato")} ${h(def.nome)}: ${fmtValor(ind.valor, def.casas)} ${h(def.unidade)} em ${def.ano}. ${h(UF_NAMES[uf])}: ${fmtValor(ind.refUF, def.casas)} · Brasil: ${fmtValor(ind.refBR, def.casas)}${def.ref_tipo.startsWith("mediana") ? " (medianas dos municípios)" : ""}.</p>
      <p>${rot("comparacao")} ${h(at.texto)} Maior que ${Math.round(ind.percentilUF)}% dos ${ind.nUF} municípios da UF.</p>`
      : `<p><strong>Sem valor para este município:</strong> ${h(motivoSemIndicador(mun, def.id))}. Não foi usado valor do estado ou de outro município no lugar — e a falta de dado não significa situação boa.</p>`}
    <p>${rot("literatura")} <strong>Por que investigar:</strong> ${h(fator.porque)}</p>
    ${at.nivel === "atencao" ? `<p>${rot("hipotese")} O valor local é desfavorável e o fator é reconhecido para a condição. É uma hipótese a investigar com a vigilância local, não uma causa comprovada dos registros deste município.</p>` : ""}
    ${defasagem ? `<p class="apoio">O indicador é de ${def.ano} e os eventos de saúde, de ${h(sel.ano)}: serve como contexto, não como medida do mesmo momento.</p>` : ""}
    ${acoes.length ? `<h4>Melhorias e prevenção relacionadas</h4><ul class="acoes-lista">${acoes.map(a => `<li><span class="acao-tipo">${h(TIPOS_ACAO[a.tipo] || "")}</span> ${h(a.texto)}
      <small>Problema que enfrenta: ${h(a.problema)} Limite: ${h(a.limitacoes)}</small></li>`).join("")}</ul>` : ""}
    <div class="assoc" data-ind="${h(def.id)}" data-causa="${h(causaFatores.id)}"><button class="btn-sec no-print" type="button">Calcular a associação entre os municípios da UF</button></div>
    <p class="apoio"><strong>Limitações:</strong> ${h(fator.limitacoes)} ${h(def.limitacoes || "")}</p>
    <p class="apoio"><strong>Indicador:</strong> ${h(def.definicao)} Fonte: ${h(def.tabela)}, ${def.ano}. Cobertura: ${fmtNum.format(def.cobertura.municipios_com_valor)} de ${fmtNum.format(def.cobertura.municipios_total)} municípios.</p>
    ${refsHtml([...f.refs])}`;
  return `<li class="fator${at.nivel === "atencao" ? " fator-atencao" : ""}">
    <div class="fator-linha">
      <div class="f-nome"><strong>${h(def.nome)}</strong><small>${h(fator.papel)}</small></div>
      ${valor}
      <span class="f-ref">${ind.refUF != null ? `UF ${fmtValor(ind.refUF, def.casas)} · BR ${fmtValor(ind.refBR, def.casas)}` : ""}</span>
      ${situacaoHtml(at)}
    </div>
    ${mais("Por que investigar, melhorias e limitações", detalhe)}
  </li>`;
}

/* Botões de associação exploratória (calculada sob demanda). */
function ligarFatores(el){
  el.querySelectorAll(".assoc button").forEach(botao => botao.addEventListener("click", async () => {
    const caixa = botao.parentElement;
    const def = base.indPorId.get(caixa.dataset.ind);
    const uf = ufDe(sel.mun), ev = EVENTOS[sel.evento];
    caixa.innerHTML = `<p role="status"><span class="spinner" aria-hidden="true"></span> Calculando...</p>`;
    try{
      const causa = sel.evento === "dengue" ? lerCausa("c:A90") : lerCausa(sel.causa);
      const disp = disponibilidade(sel.evento, causa);
      if(!disp.ok){ caixa.innerHTML = `<p class="apoio">Associação não calculada: ${h(disp.motivo)}</p>`; return; }
      const r = await associacao(uf, causa, sel.evento, sel.ano, caixa.dataset.ind);
      if(!r.suficiente){
        caixa.innerHTML = `<p>${rot("associacao")} Amostra insuficiente: apenas ${r.n} municípios de ${h(UF_NAMES[uf])} com 10 mil habitantes ou mais e dados completos (mínimo adotado: 30). A correlação não foi calculada — isso não indica ausência de relação.</p>`;
        return;
      }
      const forca = Math.abs(r.rho) < 0.1 ? "praticamente nula" : Math.abs(r.rho) < 0.3 ? "fraca" : Math.abs(r.rho) < 0.5 ? "moderada" : "forte";
      const incerta = r.ic[0] <= 0 && r.ic[1] >= 0;
      caixa.innerHTML = `<div class="assoc-resultado"><p>${rot("associacao")} Entre <strong>${r.n}</strong> municípios de ${h(UF_NAMES[uf])}, a correlação de postos (Spearman) entre <em>${h(def.nome)}</em> (${def.ano}) e a ${h(ev.taxa.toLowerCase())} (${h(sel.ano)}) é
        <strong>${fmt2.format(r.rho)}</strong> (intervalo de 95%: ${fmt2.format(r.ic[0])} a ${fmt2.format(r.ic[1])}) — ${incerta ? "o intervalo inclui zero: não dá para afirmar que exista associação, nem que ela não exista" : `associação ${forca} e ${r.rho > 0 ? "positiva (taxas maiores onde o indicador é maior)" : "negativa (taxas menores onde o indicador é maior)"}`}.</p>
        <p class="apoio">Método: taxas brutas; excluídos ${r.excluidosPop} municípios com menos de 10 mil habitantes e ${r.excluidosSemValor} sem dado. Sem ajuste por idade, renda ou outros fatores, nem por vizinhança; anos do indicador e dos eventos diferentes.
        Como vários indicadores são testados, algumas correlações aparecem por acaso. <strong>Correlação entre municípios não prova causa</strong> e não vale para indivíduos.</p></div>`;
    }catch(erro){ caixa.innerHTML = `<p class="estado estado-erro">Não foi possível calcular: ${h(erro.message)}</p>`; }
  }));
}

async function renderFatores(el, token){
  const mun = sel.mun && base.munPorCodigo.has(sel.mun) ? sel.mun : "";
  if(!mun){
    el.innerHTML = semMunicipioHtml("Fatores e melhorias", "Escolha um município para ver os indicadores do território ligados à doença, a situação de cada um no estado e as melhorias relacionadas.");
    return;
  }
  const causa = lerCausa(sel.causa);
  const causaFatores = sel.evento === "dengue" ? lerCausa("c:A90") : causa;
  const dic = base.dicionario;
  const temas = temasDaCausa(causaFatores);
  const lista = causaFatores.tipo === "todas" ? [] : fatoresDaCausa(mun, causaFatores);
  const emAtencao = lista.filter(f => f.atencao.nivel === "atencao");
  const semDado = lista.filter(f => !f.ind.disponivel);
  const ordenada = [...emAtencao, ...lista.filter(f => f.atencao.nivel !== "atencao")];

  // TOPO: síntese em uma frase + números-chave
  let manchete;
  if(causaFatores.tipo === "todas"){
    manchete = `<div class="manchete manchete-neutro"><span class="manchete-icone" aria-hidden="true">?</span><div>
      <p class="manchete-titulo">Escolha uma doença para ver os fatores ligados a ela</p>
      <p class="manchete-nota">Para “todas as causas” não há uma relação específica. Abaixo, o perfil completo do território.</p>
      <p><button class="btn-sec" type="button" onclick="_segOrigem='causa';abrirConsulta('causa')">Escolher doença</button></p></div></div>`;
  }else if(!lista.length){
    manchete = `<div class="manchete manchete-neutro"><span class="manchete-icone" aria-hidden="true">–</span><div>
      <p class="manchete-titulo">Os dados disponíveis não bastam para explicar este padrão</p>
      <p class="manchete-nota">Não há relações documentadas e revisadas entre <em>${h(causaFatores.rotulo)}</em> e os indicadores do território. Isso não significa que não existam fatores.</p></div></div>`;
  }else if(emAtencao.length){
    manchete = `<div class="manchete manchete-acima"><span class="manchete-icone" aria-hidden="true">▲</span><div>
      <p class="manchete-titulo">${emAtencao.length} de ${lista.length} indicadores ligados a ${h(causaFatores.curto)} merecem atenção</p>
      <p class="manchete-nota">Estão entre os 25% mais desfavoráveis dos municípios de ${h(UF_NAMES[ufDe(mun)])}: ${emAtencao.map(f => h(f.def.nome)).join(", ")}. São pistas para investigar, não causas comprovadas.</p></div></div>`;
  }else{
    manchete = `<div class="manchete manchete-compativel"><span class="manchete-icone" aria-hidden="true">●</span><div>
      <p class="manchete-titulo">Nenhum indicador ligado a ${h(causaFatores.curto)} está entre os mais desfavoráveis da UF</p>
      <p class="manchete-nota">Isso não descarta os fatores: os indicadores são indiretos${semDado.length ? `, ${semDado.length} não têm valor local` : ""} e vários determinantes não têm dado municipal.</p></div></div>`;
  }
  const defasados = lista.some(f => f.def.ano !== Number(sel.ano));
  const kpis = lista.length ? kpisHtml([
    { rotulo:"Indicadores ligados à condição", tom:"principal", valor: String(lista.length), nota:`de ${temas.length} ${plural(temas.length, "tema")} da literatura` },
    { rotulo:"Merecem atenção", tom: emAtencao.length ? "acima" : "", valor: String(emAtencao.length), nota:"quarto mais desfavorável da UF" },
    { rotulo:"Sem valor local", tom: semDado.length ? "sem" : "", valor: String(semDado.length), nota: semDado.length ? "falta de dado não é situação boa" : "todos com valor" },
    { rotulo:"Indicadores do território", valor: String(dic.indicadores.length), nota:`em ${dic.dimensoes.length} dimensões (perfil completo abaixo)` }
  ]) : "";

  const perfil = dic.dimensoes.map(dim => {
    const inds = dic.indicadores.filter(i => i.dimensao === dim);
    return `<h3>${h(dim)}</h3>${tabelaHtml(
      [{ t:"Indicador" }, { t:"Ano" }, { t:"Município", num:true }, { t: ufDe(mun), num:true }, { t:"Brasil", num:true }, { t:"Posição na UF" }],
      inds.map(i => {
        const il = indicadorLocal(mun, i.id);
        return [`${h(i.nome)} <small>(${h(i.unidade)})</small>`, String(i.ano),
          il.disponivel ? fmtValor(il.valor, i.casas) : `<small>${h(motivoSemIndicador(mun, i.id))}</small>`, fmtValor(il.refUF, i.casas), fmtValor(il.refBR, i.casas),
          il.disponivel ? `maior que ${Math.round(il.percentilUF)}%` : "—"];
      }), { legenda:`${dim}${inds.some(i => i.ref_tipo.startsWith("mediana")) ? " — para focos de calor, as referências são medianas dos municípios" : ""}` })}`;
  }).join("");

  el.innerHTML = `${cabecalhoMunicipio("fatores")}
    <section class="resultado" aria-label="Síntese">
      <p class="sobre">Fatores do território · ${h(causaFatores.tipo === "todas" ? "todas as causas" : causaFatores.rotulo)}</p>
      ${manchete}
      ${kpis}
      ${atencaoHtml([
        lista.length ? "Dados agregados não mostram se as pessoas que adoeceram eram as expostas. Uma relação conhecida na literatura não prova que ela explica os números deste município." : "",
        defasados ? `Os indicadores são de anos diferentes dos eventos (${h(sel.ano)}): servem como contexto.` : ""
      ].filter(Boolean))}
    </section>
    ${lista.length ? `<section class="bloco" aria-labelledby="fatTitulo">
      <div class="sec-topo"><h2 id="fatTitulo">Indicadores ligados à condição</h2></div>
      <p class="meta">Primeiro os que merecem atenção; a ordem não é um ranking de causas. Abra cada um para ver por que investigar, as melhorias e os limites.</p>
      <ul class="fatores">${ordenada.map(f => fatorHtml(f, mun, causaFatores)).join("")}</ul>
    </section>` : ""}
    <div class="detalhes">
      ${temas.length ? mais(`Sobre a condição: riscos e prevenção (${temas.length} ${plural(temas.length, "tema")})`, temas.map(t => temaHtml(t.tema, t.relacao)).join("")) : ""}
      ${mais(`Perfil completo do território (${dic.indicadores.length} indicadores)`, `
        <p class="apoio">Indicadores municipais de fontes oficiais. “Posição na UF” é relativa e não diz, sozinha, se o valor é bom ou ruim.</p>${perfil}
        <button id="perfilCsv" class="btn-sec no-print" type="button">Exportar CSV</button>`, { aberto: causaFatores.tipo === "todas" })}
      ${mais("O que ainda não está no painel", `
        <p>Estas dimensões foram avaliadas e não têm indicador municipal integrado. Não aparecem como zero nem são preenchidas com valores de estados ou capitais.</p>
        ${tabelaHtml([{ t:"Dimensão" }, { t:"Situação" }, { t:"Motivo verificado" }], dic.lacunas.map(l => [h(l.dimensao), h(l.situacao), h(l.motivo)]), { legenda:"Lacunas de dados" })}
        <p>Hábitos e condições individuais (tabagismo, alimentação, atividade física) também não têm medida para todos os municípios.</p>`)}
    </div>`;
  $("perfilCsv")?.addEventListener("click", () => baixarCSV(`perfil_${mun}.csv`,
    [["indicador", "dimensao", "unidade", "ano", "municipio", "uf", "brasil", "fonte"], ...dic.indicadores.map(i => { const il = indicadorLocal(mun, i.id);
      return [i.nome, i.dimensao, i.unidade, i.ano, il.valor ?? "indisponível", il.refUF ?? "", il.refBR ?? "", i.tabela]; })],
    [`Município: ${nomeLocal(mun)} (${mun})`, "Valores vazios ou 'indisponível' não são zero.", `Dados versão ${DATA_VERSION}`]));
  ligarFatores(el);
}

/* ============================================================
   Fontes e metodologia: índice por assunto, resumo curto,
   detalhe sob demanda.
   ============================================================ */
const FORMULAS = [
  ["Contagem", "Número de eventos registrados no período, por município de residência."],
  ["Taxa de mortalidade", "óbitos ÷ população × 100.000. População: estimativa do IBGE do mesmo ano (2024 a 2026); para 2023, Censo 2022, com aviso de defasagem."],
  ["Taxa de internações no SUS", "internações pagas pelo SUS ÷ população × 100.000. Conta internações, não pessoas, e não cobre a rede privada."],
  ["Taxa de notificações de dengue", "casos prováveis notificados ÷ população × 100.000. Não é chamada de incidência porque depende da notificação."],
  ["Participação", "eventos de uma causa ÷ total de eventos do mesmo local, tipo e período. O universo é sempre informado."],
  ["Recorte por sexo e idade", "Só para óbitos por capítulo ou total: numerador e denominador (Censo 2022) do mesmo sexo e faixa de idade. Sem denominador compatível, a taxa não é calculada."],
  ["Comparação com a referência", "Esperado = taxa da UF × população do município. Razão = observado ÷ esperado, com intervalo de 95% de Poisson (aproximação de Byar; Breslow e Day, 1987). “Acima” ou “abaixo” apenas quando todo o intervalo fica de um lado de 1; com menos de 10 eventos há aviso de instabilidade."],
  ["Padronização indireta por idade e sexo", "Esperado = soma, em cada sexo e faixa de 5 anos, de (taxa da UF × população do município), com populações do Censo 2022. Disponível para óbitos por capítulo e total. Quando muda a leitura, passa a ser a comparação principal."],
  ["Municípios comparáveis", "Mesma UF e mesma classe de porte populacional (7 classes). A posição (percentil) é relativa; exige ao menos 8 municípios no grupo."],
  ["Mapa", `Taxa do local ÷ taxa do Brasil em 5 classes fixas. Locais com menos de ${MIN_EVENTOS_MAPA} eventos observados e esperados ficam em cinza (taxa instável) e fora das listas de maiores e menores taxas.`],
  ["Associação exploratória", "Correlação de postos de Spearman entre a taxa bruta e o indicador, nos municípios da mesma UF com 10 mil habitantes ou mais; mínimo de 30 municípios; intervalo de 95% pela transformação de Fisher. Sem ajuste por confundimento, sazonalidade ou dependência espacial."],
  ["Fator “merece atenção”", "Indicador local no quarto mais desfavorável dos municípios da UF, no sentido indicado pela literatura. É um critério de triagem, não uma prova."]
];

async function renderFontes(el, token){
  el.innerHTML = carregandoHtml("Carregando os manifestos das fontes...");
  let manifestos, cobertura;
  try{ [manifestos, cobertura] = await Promise.all([fetchJSON(PATHS.manifestos), fetchJSON(PATHS.cobertura)]); }
  catch(erro){ el.innerHTML = erroHtml(erro); return; }
  if(token !== renderToken) return;
  const lista = v => Array.isArray(v) ? v : [v];
  const secoes = [["f-calculos", "Como os números são calculados"], ["f-regras", "Regras gerais"], ["f-cobertura", "Cobertura dos dados"], ["f-fontes", "Fontes de dados"], ["f-refs", "Referências de conteúdo"]];
  el.innerHTML = `
    <div class="pag-topo"><div>
      <h1 class="pag-titulo">Fontes e metodologia</h1>
      <p class="meta">Dados públicos oficiais, preparados por scripts reproduzíveis (pasta <code>scripts/</code>) · atualizados em ${h(formatarData(cobertura.gerado_em))} · versão ${h(DATA_VERSION)}</p>
    </div></div>
    ${kpisHtml([
      { rotulo:"Fontes de dados", tom:"principal", valor: String(manifestos.fontes.length), nota:"com manifesto de origem e licença" },
      { rotulo:"Indicadores do território", valor: String(base.dicionario.indicadores.length), nota:`${base.dicionario.lacunas.length} lacunas documentadas` },
      { rotulo:"Temas revisados", valor: String(base.conhecimento.temas.length), nota:`${Object.keys(base.conhecimento.referencias).length} referências` },
      { rotulo:"Municípios", valor: fmtNum.format(base.municipios.length), nota:"código IBGE de 7 dígitos" }
    ])}
    <nav class="indice" aria-label="Nesta página">${secoes.map(([id, t]) => `<a href="#${id}" data-ancora="${id}">${h(t)}</a>`).join("")}</nav>

    <section id="f-calculos" class="bloco" tabindex="-1">
      <h2>Como os números são calculados</h2>
      <p>As taxas dividem os eventos pela população do mesmo período e multiplicam por 100 mil. As comparações usam intervalos de 95% para não tratar variação ao acaso como diferença real. Abra cada item para ver a regra.</p>
      ${FORMULAS.map(([t, d]) => mais(h(t), `<p>${h(d)}</p>`)).join("")}
    </section>

    <section id="f-regras" class="bloco" tabindex="-1">
      <h2>Regras gerais</h2>
      <ul>
        <li>Anos parciais (prévias) não são projetados para 12 meses nem comparados a anos completos sem aviso.</li>
        <li>Eventos de sistemas diferentes (óbitos, internações, notificações) nunca são somados.</li>
        <li>Zero observado, dado indisponível e dado suprimido são mostrados de forma diferente; ausência de registro não é tratada como zero de doença.</li>
        <li>Indicadores de estados ou capitais não são atribuídos a municípios.</li>
      </ul>
      ${mais("Códigos municipais e privacidade", `<p>Códigos municipais: IBGE de 7 dígitos; fontes com 6 dígitos são convertidas pela tabela oficial. Fontes só com nome são resolvidas por nome exato e UF, sem aproximação.</p>
        <p><strong>Privacidade:</strong> o painel publica apenas contagens agregadas. O detalhe por sexo e idade existe só no nível de capítulo; categorias aparecem apenas como total do município, como no tabulador público do Ministério da Saúde. Não foi adotado um limiar único de supressão: as contagens pequenas vêm de bases já públicas e são acompanhadas de aviso de instabilidade.</p>`)}
    </section>

    <section id="f-cobertura" class="bloco" tabindex="-1">
      <h2>Cobertura dos dados</h2>
      <p>Óbitos por município e causa (todas as categorias da CID-10), internações no SUS por capítulo e notificações de dengue. Incidência de outras doenças não está disponível.</p>
      ${mais("Matriz de cobertura por fonte, período e nível territorial", `
        ${tabelaHtml([{ t:"Fonte" }, { t:"Desfecho ou indicador" }, { t:"Período" }, { t:"Nível territorial" }, { t:"Cobertura" }, { t:"Situação" }],
          cobertura.matriz.map(l => [h(l.fonte), h(l.desfecho), h(l.periodo), h(l.nivel), h(l.cobertura), h(l.situacao)]), { legenda:"Matriz de cobertura" })}
        <p>Relatórios de validação: ${cobertura.relatorios.map(r => `<a href="${h(r)}" target="_blank" rel="noopener">${h(r.split("/").pop())}</a>`).join(" · ")}</p>`)}
    </section>

    <section id="f-fontes" class="bloco" tabindex="-1">
      <h2>Fontes de dados</h2>
      <p>Cada fonte tem um manifesto com página de origem, licença, período, definição, valores ausentes, limitações e o comando de atualização.</p>
      ${manifestos.fontes.map(m => mais(`<strong>${h(m.titulo)}</strong> <small>${h(m.instituicao)} · ${h(m.periodo_referencia)}</small>`, `
        <p>${h(m.definicao)}</p>
        <dl class="def">
          <dt>Página</dt><dd><a href="${h(urlSegura(m.pagina))}" target="_blank" rel="noopener noreferrer">${h(m.pagina)}</a></dd>
          <dt>Licença ou condições</dt><dd>${h(m.licenca)}</dd>
          <dt>Versão</dt><dd>${h(m.versao)}</dd>
          <dt>Coletado em</dt><dd>${h(formatarData(m.coletado_em))}</dd>
          <dt>Granularidade</dt><dd>${h(m.granularidade)}</dd>
          <dt>Unidade</dt><dd>${h(m.unidade)}</dd>
          <dt>Cobertura</dt><dd>${h(m.cobertura)}</dd>
          <dt>Valores ausentes</dt><dd>${h(m.valores_ausentes)}</dd>
          <dt>Limitações</dt><dd>${h(m.limitacoes)}</dd>
          <dt>Atualização</dt><dd><code>${h(m.comando_atualizacao)}</code></dd>
          <dt>Recursos usados</dt><dd><ul>${lista(m.recursos).slice(0, 12).map(r => `<li class="quebra">${h(r)}</li>`).join("")}${lista(m.recursos).length > 12 ? `<li>… e mais ${lista(m.recursos).length - 12}</li>` : ""}</ul></dd>
          <dt>Campos</dt><dd><ul>${Object.entries(m.campos || {}).map(([k, v]) => `<li><code>${h(k)}</code>: ${h(v)}</li>`).join("")}</ul></dd>
        </dl>`)).join("")}
    </section>

    <section id="f-refs" class="bloco" tabindex="-1">
      <h2>Referências de conteúdo</h2>
      <p>${h(base.conhecimento.meta.natureza)} Endereços verificados em ${h(formatarData(base.conhecimento.meta.enderecos_verificados_em))}.</p>
      ${mais(`Lista de referências (${Object.keys(base.conhecimento.referencias).length})`, refsHtml(Object.keys(base.conhecimento.referencias)))}
    </section>`;
  // Âncoras internas sem mexer na rota (a URL usa o hash para navegar).
  el.querySelectorAll("[data-ancora]").forEach(a => a.addEventListener("click", ev => {
    ev.preventDefault();
    const alvo = $(a.dataset.ancora);
    alvo.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block:"start" });
    alvo.focus({ preventScroll:true });
  }));
}

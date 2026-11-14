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
    ...cid.capitulos.map(c => ({ valor:`cap:${c.n}`, codigo:`${c.ini}–${c.fim}`, nome:`Capítulo ${c.rom}: ${c.nome}`, busca: normText(c.nome), tipo:"capítulo" })),
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
    .map(t => ({ t, k: normText(t.termo) }))
    .map(({ t, k }) => ({ t, nota: k === q ? 0 : k.startsWith(q) ? 1 : (q.length >= 4 && k.includes(q)) ? 2 : (q.length >= 4 && q.includes(k)) ? 3 : -1 }))
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
    ${cabecalhoPagina({ titulo:"Doenças e condições",
      contexto:`CID-10: ${fmtNum.format(meta.totais.capitulos)} capítulos · ${fmtNum.format(meta.totais.grupos)} agrupamentos · ${fmtNum.format(meta.totais.categorias)} categorias · ${fmtNum.format(meta.totais.subcategorias)} subcategorias` })}
    <div class="grade grade-lateral${sel.cid ? " tem-ficha" : ""}">
      <aside class="cartao painel-lateral" aria-label="Buscar doença">
        <div class="cartao-corpo">
          <label for="cidBusca" class="campo-rotulo">Buscar por nome, código ou termo popular</label>
          <input id="cidBusca" type="search" autocomplete="off" placeholder="Ex.: infarto, derrame, I21" />
          <div id="cidLista" aria-live="polite"></div>
        </div>
      </aside>
      <div id="cidFicha" class="grade-col"></div>
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
      <p>Digite o nome popular (“derrame”, “pressão alta”) ou o código da CID-10 (“I21”). Ou escolha uma das sugestões ao lado.</p>
</div>`;
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
  const trilha = [`<a href="${h(linkPara({ rota:"doencas", cid:`cap:${cap.n}` }))}">Cap. ${h(cap.rom)}: ${h(cap.nome)}</a>`];
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
      <section class="cartao ficha-cab">
        <div class="cartao-corpo">
          <nav class="trilha" aria-label="Posição na classificação">${trilha.join(' <span aria-hidden="true">›</span> ')}</nav>
          <h2 id="fichaTitulo" class="ficha-titulo"><span class="codigo">${h(codigo)}</span> ${h(nome)}</h2>
          <p class="meta">${h(nivel)} da CID-10</p>
          <div id="cidKpis">${carregandoHtml("Somando os registros do Brasil...")}</div>
          ${atencaoHtml(avisos)}
        </div>
        <footer class="cartao-rodape acoes no-print">
          <a class="btn" href="${h(linkPara({ rota: sel.mun ? "municipio" : "mapa", causa: causa.id, evento:"obitos", visao:"" }))}">${sel.mun ? `Analisar em ${h(nomeLocal(sel.mun))}` : "Ver no mapa do Brasil"}</a>
          ${sel.mun ? `<a class="btn-sec" href="${h(linkPara({ rota:"mapa", causa: causa.id, evento:"obitos" }))}">Ver no mapa</a>` : `<button class="btn-sec" type="button" onclick="navegar({ rota:'municipio', causa:'${h(causa.id)}', evento:'obitos' })">Analisar em um município</button>`}
          <a class="btn-sec" href="${h(linkPara({ rota:"comparar", modoCmp:"doencas", causasCmp:[causa.id] }))}">Comparar com outras doenças</a>
        </footer>
      </section>
      <div id="cidTend"></div>
      ${cartao({ titulo:`Riscos e prevenção ${rot("literatura")}`,
        corpo: temas.length ? temas.map(t => temaHtml(t.tema, t.relacao)).join("")
          : `<p><strong>Sem conteúdo explicativo revisado para este código.</strong> O painel mostra só os números quando não há texto revisado; nada é preenchido automaticamente.</p>` })}
      <section class="cartao cartao-detalhes" aria-label="Mais informações"><div id="cidDetalhes" class="cartao-corpo"></div></section>
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
      { rotulo:"Taxa do Brasil", valor: fmtValor(atual.taxa), nota:"óbitos por 100 mil habitantes" }
    ]);

    // MEIO: tendência no Brasil
    $("cidTend").innerHTML = cartao({ titulo:"Evolução no Brasil", descricao:"Óbitos por 100 mil habitantes, por causa básica",
      corpo: tendenciaSvg([{ nome:"Brasil", pontos: dados.map(d => ({ ano:d.ano, valor:d.taxa, parcial:!d.info.ano_completo })) }],
        { titulo:"Taxa de mortalidade no Brasil por ano" }) });

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
  atencao: { texto:"Entre os piores do estado", classe:"situ-atencao", simbolo:"▲" },
  intermediario: { texto:"Na média do estado", classe:"", simbolo:"" },
  favoravel: { texto:"Melhor que a maioria do estado", classe:"", simbolo:"" },
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
    ${mais("Por que importa e limites", detalhe)}
  </li>`;
}

/* Melhorias: junta as ações de todos os fatores, sem repetir.
   Prioritárias = ligadas a algum indicador que merece atenção no município. */
function melhoriasDaCausa(lista){
  const porId = new Map();
  for(const f of lista){
    for(const id of f.acoes){
      const acao = base.conhecimento.acoes[id];
      if(!acao?.texto) continue;
      if(!porId.has(id)) porId.set(id, { id, ...acao, fatores: [], prioridade: false });
      const item = porId.get(id);
      item.fatores.push(f);
      if(f.atencao.nivel === "atencao") item.prioridade = true;
    }
  }
  const ordem = { poder_publico: 0, comunidade: 1, populacao: 2 };
  return [...porId.values()].sort((a, b) => (b.prioridade - a.prioridade) || ((ordem[a.tipo] ?? 9) - (ordem[b.tipo] ?? 9)));
}

function melhoriaHtml(m){
  const motivo = m.fatores.filter(f => f.atencao.nivel === "atencao").map(f =>
    { const u = f.def.unidade === "%" ? "%" : ` ${f.def.unidade}`;
      return `${h(f.def.nome)}: ${fmtValor(f.ind.valor, f.def.casas)}${h(u)}, contra ${fmtValor(f.ind.refUF, f.def.casas)}${h(u)} no estado`; });
  return `<li class="melhoria${m.prioridade ? " melhoria-prio" : ""}">
    <span class="melhoria-quem">${h(TIPOS_ACAO[m.tipo] || "")}</span>
    <p class="melhoria-texto">${h(m.texto)}</p>
    <p class="melhoria-por">${motivo.length ? `<strong>Por que aqui:</strong> ${motivo.join("; ")}` : `<strong>Enfrenta:</strong> ${h(m.problema)}`}</p>
  </li>`;
}

function melhoriasHtml(lista){
  const todas = melhoriasDaCausa(lista);
  if(!todas.length) return "";
  const prio = todas.filter(m => m.prioridade), outras = todas.filter(m => !m.prioridade);
  return cartao({
    titulo: "O que pode melhorar",
    nivel: 3,
    classe: "melhorias",
    descricao: prio.length ? "Primeiro as ações ligadas aos indicadores em que o município está entre os piores do estado."
      : "Nenhum indicador está entre os piores do estado; estas são as ações recomendadas para a condição em geral.",
    corpo: prio.length
      ? `<ol class="melhorias-lista">${prio.map(melhoriaHtml).join("")}</ol>
         ${outras.length ? mais(`Outras ações recomendadas para esta condição (${outras.length})`, `<ol class="melhorias-lista">${outras.map(melhoriaHtml).join("")}</ol>`) : ""}`
      : `<ol class="melhorias-lista">${outras.map(melhoriaHtml).join("")}</ol>`
  });
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

/* Seção "Fatores e melhorias" da página do município. */
function secaoFatoresHtml(mun){
  const causa = lerCausa(sel.causa);
  const causaFatores = sel.evento === "dengue" ? lerCausa("c:A90") : causa;
  const dic = base.dicionario;
  const temas = temasDaCausa(causaFatores);
  const lista = causaFatores.tipo === "todas" ? [] : fatoresDaCausa(mun, causaFatores);
  const emAtencao = lista.filter(f => f.atencao.nivel === "atencao");
  const ordenada = [...emAtencao, ...lista.filter(f => f.atencao.nivel !== "atencao")];

  const perfil = dic.dimensoes.map(dim => {
    const inds = dic.indicadores.filter(i => i.dimensao === dim);
    return `<h4>${h(dim)}</h4>${tabelaHtml(
      [{ t:"Indicador" }, { t:"Ano" }, { t:"Município", num:true }, { t: ufDe(mun), num:true }, { t:"Brasil", num:true }, { t:"Posição na UF" }],
      inds.map(i => {
        const il = indicadorLocal(mun, i.id);
        return [`${h(i.nome)} <small>(${h(i.unidade)})</small>`, String(i.ano),
          il.disponivel ? fmtValor(il.valor, i.casas) : `<small>${h(motivoSemIndicador(mun, i.id))}</small>`, fmtValor(il.refUF, i.casas), fmtValor(il.refBR, i.casas),
          il.disponivel ? `maior que ${Math.round(il.percentilUF)}%` : "—"];
      }))}`;
  }).join("");
  const extras = `<div class="extras">
      ${temas.length ? mais(`Riscos e prevenção da doença`, temas.map(t => temaHtml(t.tema, t.relacao)).join("")) : ""}
      ${mais(`Perfil completo do território (${dic.indicadores.length} indicadores)`, `
        <p class="apoio">“Posição na UF” é relativa e não diz, sozinha, se o valor é bom ou ruim.</p>${perfil}
        <button id="perfilCsv" class="btn-sec no-print" type="button">Exportar CSV</button>`)}
      ${mais("O que ainda não está no painel", `
        ${tabelaHtml([{ t:"Dimensão" }, { t:"Situação" }, { t:"Motivo verificado" }], dic.lacunas.map(l => [h(l.dimensao), h(l.situacao), h(l.motivo)]))}`)}
    </div>`;

  let corpo;
  if(causaFatores.tipo === "todas"){
    corpo = `<p class="secao-intro">Os fatores e as melhorias dependem da doença. Escolha uma em <a href="#" data-foco-campo="causa">“Doença ou grupo”</a>, nos filtros acima.</p>`;
  }else if(!lista.length){
    corpo = `<p class="secao-intro">Não há relações documentadas entre ${h(causaFatores.curto.toLowerCase())} e os indicadores do território.</p>`;
  }else{
    corpo = `<p class="secao-intro">${emAtencao.length
        ? `<strong>${emAtencao.length === 1 ? "1 ponto de atenção" : `${emAtencao.length} pontos de atenção`}:</strong> ${emAtencao.map(f => h(f.def.nome.toLowerCase())).join(", ")}. O município está entre os 25% piores do estado nesse indicador. É pista para investigar, não causa comprovada.`
        : `Nenhum fator ligado a ${h(causaFatores.curto.toLowerCase())} está entre os 25% piores do estado.`}</p>
      ${melhoriasHtml(lista)}
      ${recolhivel({ titulo:"Situação do município em cada fator",
        resumo:`${lista.length} ${plural(lista.length, "fator", "fatores")} · ${emAtencao.length ? `${emAtencao.length} entre os piores do estado` : "nenhum entre os piores do estado"} · comparado aos outros municípios do estado`,
        corpo:`<ul class="fatores">${ordenada.map(f => fatorHtml(f, mun, causaFatores)).join("")}</ul>` })}`;
  }
  return `<section id="sec-melhorias" class="secao" aria-labelledby="sec-melhorias-t">
    <h2 id="sec-melhorias-t" class="secao-titulo">Fatores e melhorias</h2>
    ${corpo}
    ${extras}
  </section>`;
}

function ligarSecaoFatores(el, mun){
  const dic = base.dicionario;
  el.querySelectorAll("[data-foco-campo]").forEach(a => a.addEventListener("click", ev => { ev.preventDefault(); abrirConsulta(a.dataset.focoCampo); }));
  $("perfilCsv")?.addEventListener("click", () => baixarCSV(`perfil_${mun}.csv`,
    [["indicador", "dimensao", "unidade", "ano", "municipio", "uf", "brasil", "fonte"], ...dic.indicadores.map(i => { const il = indicadorLocal(mun, i.id);
      return [i.nome, i.dimensao, i.unidade, i.ano, il.valor ?? "indisponível", il.refUF ?? "", il.refBR ?? "", i.tabela]; })],
    [`Município: ${nomeLocal(mun)} (${mun})`, "Valores vazios ou 'indisponível' não são zero.", `Dados versão ${DATA_VERSION}`]));
  ligarFatores(el);
}

/* Link antigo #/fatores: abre a página do município já na seção de fatores. */
async function renderFatores(el, token){
  await renderMunicipio(el, token);
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
  let manifestos, cobertura, outliers;
  try{ [manifestos, cobertura, outliers] = await Promise.all([fetchJSON(PATHS.manifestos), fetchJSON(PATHS.cobertura), fetchJSON(PATHS.outliers)]); }
  catch(erro){ el.innerHTML = erroHtml(erro); return; }
  if(token !== renderToken) return;
  const lista = v => Array.isArray(v) ? v : [v];
  const secoes = [["f-sobre", "Achados"], ["f-atualizacao", "Atualização"], ["f-calculos", "Como os números são calculados"], ["f-regras", "Regras gerais"],
    ["f-tratamento", "Tratamento dos dados"], ["f-cobertura", "Cobertura dos dados"], ["f-fontes", "Fontes de dados"], ["f-refs", "Referências de conteúdo"]];
  const persist = outliers.acima_em_todos_os_anos || {};
  const taxaOut = (ev, ano) => outliers.taxas.find(t => t.evento === ev && t.ano === ano);
  const ultimoAno = ev => outliers.taxas.filter(t => t.evento === ev).map(t => t.ano).sort().pop();
  const obUlt = taxaOut("obitos", ultimoAno("obitos"));
  const somaInv = Object.values(outliers.invalidos || {}).reduce((s, v) => s + v, 0);
  el.innerHTML = `
    ${cabecalhoPagina({ titulo:"Fontes e metodologia", contexto:`Dados atualizados em ${h(formatarData(cobertura.gerado_em))} · versão ${h(DATA_VERSION)}` })}
    <div class="grade grade-lateral grade-fontes">
    <nav class="cartao painel-lateral indice" aria-label="Nesta página"><div class="cartao-corpo">${secoes.map(([id, t]) => `<a href="#${id}" data-ancora="${id}">${h(t)}</a>`).join("")}</div></nav>
    <div class="grade-col">

    <section id="f-sobre" class="cartao cartao-texto" tabindex="-1">
      <h2>Achados</h2>
      <p>Comparando taxas com o esperado para a população (e não contagens absolutas, que sempre favorecem municípios pequenos):</p>
      <ul>
        ${persist.internacoes ? `<li><strong>${fmtNum.format(persist.internacoes.municipios)} municípios</strong> ficaram acima do esperado em internações no SUS em todos os anos completos (${h(persist.internacoes.anos.join(", "))}), mesmo descontada a variação natural entre municípios. Excesso persistente pede verificação: pode ser carga real de doença, falta de atenção básica que evitaria internações ou padrão de registro a auditar.</li>` : ""}
        ${persist.obitos ? `<li><strong>${fmtNum.format(persist.obitos.municipios)} municípios</strong> ficaram acima do esperado em óbitos por todas as causas em ${h(persist.obitos.anos.join(" e "))} (comparação sem ajuste por idade; a análise municipal mostra a versão ajustada).</li>` : ""}
        ${obUlt ? `<li>Em ${h(obUlt.ano)}, ${fmtNum.format(obUlt.funil_998.acima)} municípios tiveram mortalidade geral acima e ${fmtNum.format(obUlt.funil_998.abaixo)} abaixo do limite de 99,8% — os “abaixo” incluem possíveis casos de sub-registro.</li>` : ""}
      </ul>
    </section>

    <section id="f-atualizacao" class="cartao cartao-texto" tabindex="-1">
      <h2>Atualização</h2>
      <p><strong>Última atualização dos dados: ${h(formatarData(cobertura.gerado_em))}.</strong> Frequência do painel: <strong>${h(manifestos.frequencia_painel || "mensal")}</strong>, rodando <code>python3 scripts/atualizar_tudo.py</code>, que baixa as fontes, trata, valida e só publica se todas as verificações passarem. Anos ainda em andamento aparecem como “parcial” e não são comparados com anos completos.</p>
      ${tabelaHtml([{ t:"Fonte" }, { t:"Frequência de publicação da fonte" }, { t:"Coletado em" }],
        manifestos.fontes.map(m => [h(m.titulo), h(m.frequencia_fonte || "—"), h(formatarData(m.coletado_em))]), { legenda:"Frequência de cada fonte oficial" })}
    </section>

    <section id="f-calculos" class="cartao cartao-texto" tabindex="-1">
      <h2>Como os números são calculados</h2>
      <p>As taxas dividem os eventos pela população do mesmo período e multiplicam por 100 mil. As comparações usam intervalos de 95% para não tratar variação ao acaso como diferença real. Abra cada item para ver a regra.</p>
      ${FORMULAS.map(([t, d]) => mais(h(t), `<p>${h(d)}</p>`)).join("")}
    </section>

    <section id="f-regras" class="cartao cartao-texto" tabindex="-1">
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

    <section id="f-tratamento" class="cartao cartao-texto" tabindex="-1">
      <h2>Tratamento dos dados</h2>
      <p>A base publicada é gerada pelos scripts a partir dos arquivos oficiais e carregada também em MySQL/MariaDB (<code>scripts/importar_mysql.py</code>, esquema em <code>sql/esquema.sql</code>).</p>
      ${kpisHtml([
        { rotulo:"Valores impossíveis", tom: somaInv ? "acima" : "principal", valor: fmtNum.format(somaInv), nota:"negativos, população ≤ 0, mais casos que habitantes" },
        { rotulo:"Linhas duplicadas", valor:"0", nota:"chaves únicas conferidas em todos os arquivos" },
        { rotulo:"Atípicos sinalizados", valor: fmtNum.format(outliers.total_sinalizados), nota:"mantidos na base, listados para revisão" },
        { rotulo:"Municípios sem população", valor: fmtNum.format(outliers.populacao?.com_ano_sem_valor ?? 0), nota:"em algum ano; taxa não calculada" }
      ])}
      ${mais("Dados ausentes ou faltantes", `<p>Nada é preenchido com zero, média ou valor de outro lugar. Combinação sem registro significa nenhum evento no arquivo publicado (e o painel avisa que isso não prova ausência da doença). População ou indicador sem valor publicado ficam como “indisponível”, com o motivo; no MySQL, não geram linha. Óbitos com município ignorado entram só no total da UF.</p>`)}
      ${mais("Duplicidades", `<p>Cada arquivo tem uma chave (ano, município, causa…). A validação falha se a mesma chave aparecer duas vezes, e no MySQL as chaves primárias compostas impedem a repetição. Os totais por município, capítulo e UF são conferidos com o total de cada fonte, e os óbitos de 2023 bateram célula a célula com o TabNet (68.133 de 68.133).</p>`)}
      ${mais("Outliers (valores atípicos)", `
        <p><strong>Regra:</strong> taxas por município comparadas por dois métodos — Tukey sobre o logaritmo da taxa (só onde se esperam ao menos 10 eventos) e gráfico de funil de Poisson com limite de 99,8%, alargado pela variação natural entre municípios (sobredispersão). Indicadores do território: Tukey com 3 intervalos interquartis.</p>
        <p><strong>Decisão:</strong> valores impossíveis seriam removidos (não há nenhum). Os atípicos são registros oficiais plausíveis e foram <strong>mantidos e sinalizados</strong>; a interface já protege a leitura com intervalo de 95%, aviso com menos de 10 eventos, mapa em cinza com menos de ${MIN_EVENTOS_MAPA} e listas que excluem taxas instáveis.</p>
        ${tabelaHtml([{ t:"Evento" }, { t:"Ano" }, { t:"Tukey moderado", num:true }, { t:"Tukey extremo", num:true }, { t:"Funil: acima", num:true }, { t:"Funil: abaixo", num:true }],
          outliers.taxas.map(t => [h(EVENTOS[t.evento]?.rotulo || t.evento), h(t.ano), fmtNum.format(t.tukey_log10.moderado), fmtNum.format(t.tukey_log10.extremo), fmtNum.format(t.funil_998.acima), fmtNum.format(t.funil_998.abaixo)]),
          { legenda:"Municípios sinalizados por evento e ano (todas as causas, anos completos)" })}
        <p>Lista completa: <a href="dados/relatorios/outliers.csv" download>outliers.csv</a> · resumo: <a href="dados/relatorios/outliers.json" target="_blank" rel="noopener">outliers.json</a>.</p>`)}
      ${mais("Base em MySQL", `<p>19 tabelas (território, população, CID-10, óbitos, internações, dengue, indicadores, lacunas, outliers, fontes e controle de carga) e duas visões com as regras de negócio (taxa por 100 mil com a população do mesmo ano). A importação confere linhas e somas de cada tabela com os arquivos de origem. Consultas de exemplo em <code>sql/consultas.sql</code>.</p>`)}
    </section>

    <section id="f-cobertura" class="cartao cartao-texto" tabindex="-1">
      <h2>Cobertura dos dados</h2>
      <p>Óbitos por município e causa (todas as categorias da CID-10), internações no SUS por capítulo e notificações de dengue. Incidência de outras doenças não está disponível.</p>
      ${mais("Matriz de cobertura por fonte, período e nível territorial", `
        ${tabelaHtml([{ t:"Fonte" }, { t:"Desfecho ou indicador" }, { t:"Período" }, { t:"Nível territorial" }, { t:"Cobertura" }, { t:"Situação" }],
          cobertura.matriz.map(l => [h(l.fonte), h(l.desfecho), h(l.periodo), h(l.nivel), h(l.cobertura), h(l.situacao)]), { legenda:"Matriz de cobertura" })}
        <p>Relatórios de validação: ${cobertura.relatorios.map(r => `<a href="${h(r)}" target="_blank" rel="noopener">${h(r.split("/").pop())}</a>`).join(" · ")}</p>`)}
    </section>

    <section id="f-fontes" class="cartao cartao-texto" tabindex="-1">
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

    <section id="f-refs" class="cartao cartao-texto" tabindex="-1">
      <h2>Referências de conteúdo</h2>
      <p>${h(base.conhecimento.meta.natureza)} Endereços verificados em ${h(formatarData(base.conhecimento.meta.enderecos_verificados_em))}.</p>
      ${mais(`Lista de referências (${Object.keys(base.conhecimento.referencias).length})`, refsHtml(Object.keys(base.conhecimento.referencias)))}
    </section>
    </div></div>`;
  // Âncoras internas sem mexer na rota (a URL usa o hash para navegar).
  el.querySelectorAll("[data-ancora]").forEach(a => a.addEventListener("click", ev => {
    ev.preventDefault();
    const alvo = $(a.dataset.ancora);
    alvo.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block:"start" });
    alvo.focus({ preventScroll:true });
  }));
}

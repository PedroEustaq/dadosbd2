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

/* ============================================================
   Doenças e CID
   ============================================================ */
async function renderDoencas(el, token){
  const meta = base.cid.meta;
  el.innerHTML = `<div class="card">
      <h1>Doenças e CID</h1>
      <p class="sub">${h(meta.edicao)} · idioma: português do Brasil · origem: ${h(meta.origem)} · arquivos de ${h(formatarData(meta.data_dos_arquivos_na_fonte))}, coletados em ${h(formatarData(meta.coletado_em))}</p>
      <p>${fmtNum.format(meta.totais.capitulos)} capítulos, ${fmtNum.format(meta.totais.grupos)} agrupamentos, ${fmtNum.format(meta.totais.categorias)} categorias e ${fmtNum.format(meta.totais.subcategorias)} subcategorias.
      A CID também classifica sintomas, lesões, causas externas e motivos de contato com serviços de saúde, que não são doenças. O catálogo é completo; ter um código aqui <strong>não</strong> significa que existam dados locais ou texto explicativo para ele — cada ficha mostra o que há.</p>
      <div class="field"><label for="cidBusca">Buscar no catálogo (nome, código com ou sem ponto, termo popular)</label>
        <input id="cidBusca" type="text" autocomplete="off" placeholder="Ex.: I21.9, pneumonia, derrame, A00-A09" /></div>
      <p class="hint">${h(base.conhecimento.aviso_termos)} Outras versões (como a CID-11) não estão carregadas: não há conversão automática entre versões.</p>
    </div>
    <div class="duas-colunas">
      <div class="card" id="cidLista" aria-live="polite"></div>
      <div id="cidFicha"></div>
    </div>`;
  const busca = $("cidBusca");
  const listar = () => renderListaCid(busca.value);
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
    el.innerHTML = `<h2>Resultados</h2>${resultados.length ? `<ul class="lista-cid">${resultados.map(r =>
      `<li><a href="${h(linkPara({ rota:"doencas", cid:r.valor }))}"><b>${h(r.codigo)}</b> ${h(r.nome)} <small>${h(r.tipo)}${r.popular ? ` · “${h(r.popular)}”` : ""}</small></a></li>`).join("")}</ul>`
      : `<p class="nota">Nenhum item encontrado para “${h(texto)}”. Tente outro nome ou o código.</p>`}`;
    return;
  }
  const cid = base.cid;
  el.innerHTML = `<h2>Hierarquia</h2><p class="hint">Abra um capítulo para ver os agrupamentos e as categorias.</p>` + cid.capitulos.map(cap =>
    `<details class="arvore" data-cap="${cap.n}"><summary><b>${h(cap.rom)}</b> ${h(cap.nome)} <small>${h(cap.ini)}–${h(cap.fim)}</small></summary><div class="arvore-corpo"></div></details>`).join("");
  el.querySelectorAll("details.arvore").forEach(d => d.addEventListener("toggle", () => {
    const corpo = d.querySelector(".arvore-corpo");
    if(!d.open || corpo.dataset.pronto) return;
    corpo.dataset.pronto = "1";
    const n = Number(d.dataset.cap);
    const especificos = new Set([...base.catPorCodigo.values()].map(c => c.grupo));
    corpo.innerHTML = `<p><a href="${h(linkPara({ rota:"doencas", cid:`cap:${n}` }))}">Ficha do capítulo</a></p>` + cid.grupos.map((g, i) => ({ g, i })).filter(x => x.g.cap === n).map(({ g, i }) => {
      const cats = especificos.has(i) ? cid.categorias.filter(c => c[2] === i) : [];
      return `<details class="arvore nivel2"><summary><a href="${h(linkPara({ rota:"doencas", cid:`g:${g.ini}-${g.fim}` }))}"><b>${h(g.ini)}–${h(g.fim)}</b></a> ${h(g.nome)}${cats.length ? "" : " <small>(agrupamento amplo)</small>"}</summary>
        <ul class="lista-cid">${cats.map(c => `<li><a href="${h(linkPara({ rota:"doencas", cid:`c:${c[0]}` }))}"><b>${h(c[0])}</b> ${h(c[1])}</a></li>`).join("")}</ul></details>`;
    }).join("");
  }));
}

async function renderFichaCid(token){
  const el = $("cidFicha");
  if(!el) return;
  if(!sel.cid){
    el.innerHTML = `<div class="card vazio"><h2>Ficha da doença ou condição</h2><p>Escolha um item na busca ou na hierarquia para ver o código, a posição na classificação, os dados disponíveis, fatores de risco e prevenção.</p></div>`;
    return;
  }
  let sub = null, causa;
  if(sel.cid.startsWith("s:")){
    const subs = await carregarSubcategorias();
    sub = subs.get(sel.cid.slice(2));
    if(!sub){ el.innerHTML = `<div class="card"><p class="nota">Código não encontrado no catálogo.</p></div>`; return; }
    causa = lerCausa(`c:${sub.codigo.slice(0, 3)}`);
  }else causa = lerCausa(sel.cid);
  if(causa.tipo === "todas"){ el.innerHTML = `<div class="card"><p class="nota">Código não encontrado no catálogo.</p></div>`; return; }
  const cap = base.cid.capitulos[causa.cap - 1];
  const cat = causa.tipo === "c" ? base.catPorCodigo.get(causa.ini) : null;
  const grupo = cat ? base.cid.grupos[cat.grupo] : null;
  const trilha = [`<a href="${h(linkPara({ rota:"doencas", cid:`cap:${cap.n}` }))}">Capítulo ${h(cap.rom)} — ${h(cap.nome)}</a>`];
  if(grupo) trilha.push(`<a href="${h(linkPara({ rota:"doencas", cid:`g:${grupo.ini}-${grupo.fim}` }))}">${h(grupo.ini)}–${h(grupo.fim)} ${h(grupo.nome)}</a>`);
  if(sub) trilha.push(`<a href="${h(linkPara({ rota:"doencas", cid:causa.id }))}">${h(causa.rotulo)}</a>`);
  const codigo = sub ? `${sub.codigo.slice(0, 3)}.${sub.codigo.slice(3)}` : causa.codigo;
  const nome = sub ? sub.nome : causa.curto;
  const suplemento = sub ? sub.sup : cat?.sup;
  const temas = temasDaCausa(causa);

  el.innerHTML = `<div class="card">
      <p class="trilha">${trilha.join(" › ")}</p>
      <h2><span class="codigo">${h(codigo)}</span> ${h(nome)}</h2>
      <p class="sub">${sub ? "Subcategoria" : { cap:"Capítulo", g:"Agrupamento", c:"Categoria" }[causa.tipo]} da CID-10 · natureza: ${h(cap.tipo)}</p>
      ${suplemento ? `<p class="nota">Código criado pela OMS depois da edição de 2008 usada no catálogo. Nome em tradução livre do projeto, a partir da versão 2019 da CID-10.</p>` : ""}
      ${sub && !sub.causaObito ? `<p class="nota">Segundo a tabela do DATASUS, esta subcategoria não deve ser usada como causa básica de óbito.</p>` : ""}
      ${sub?.sexo ? `<p class="nota">Código restrito ao sexo ${sub.sexo === "F" ? "feminino" : "masculino"}.</p>` : ""}
      <div class="acoes no-print">
        <a class="btn" href="${h(linkPara({ rota: sel.mun ? "municipio" : "mapa", causa: causa.id, evento:"obitos" }))}">${sel.mun ? `Analisar em ${h(nomeLocal(sel.mun))}` : "Ver no mapa"}</a>
        ${sel.mun ? `<a class="btn ghost" href="${h(linkPara({ rota:"mapa", causa: causa.id, evento:"obitos" }))}">Ver no mapa</a>` : ""}
      </div>
      ${sub ? `<p class="nota">Os dados municipais vão até a categoria ${h(causa.codigo)}. Para a subcategoria há apenas totais por estado e do Brasil (abaixo).</p>` : ""}
    </div>
    <div class="card" id="cidCobertura">${carregandoHtml("Verificando os dados disponíveis...")}</div>
    <div id="cidSubs"></div>
    <div class="card">
      <h2>Fatores de risco, transmissão e prevenção ${etiqueta("literatura")}</h2>
      ${temas.length ? temas.map(t => temaHtml(t.tema, t.relacao)).join("") : `<p class="nota"><strong>Sem conteúdo explicativo revisado para este código.</strong> A base de conhecimento do painel cobre ${base.conhecimento.temas.length} temas (${base.conhecimento.temas.map(t => h(t.nome.split(" (")[0])).join("; ")}). Para os demais códigos o painel mostra apenas os números, sem texto preenchido automaticamente.</p>`}
      <p class="hint">${h(base.conhecimento.meta.natureza)} Revisado em ${h(formatarData(base.conhecimento.meta.revisado_em))}.</p>
    </div>`;

  // Cobertura epidemiológica real
  try{
    const anos = anosDe("obitos");
    const porAno = await Promise.all(anos.map(a => simUFs(a)));
    if(token !== renderToken) return;
    const linhas = anos.map((a, i) => {
      const br = porAno[i].get("BR");
      const n = sub ? (br.cid4.get(sub.codigo) || 0) : contarCausa(br.cid3, causa);
      const ufs = ALL_UFS.filter(uf => sub ? porAno[i].get(uf)?.cid4.get(sub.codigo) : contarCausa(porAno[i].get(uf)?.cid3, causa)).length;
      return [h(a), h(infoAno("obitos", a).periodo), fmtNum.format(n), fmtValor(taxa(n, popDe("BR", a)?.valor)), `${ufs} de 27`];
    });
    const dispSih = disponibilidade("internacoes", causa), dispDengue = disponibilidade("dengue", causa);
    $("cidCobertura").innerHTML = `<h2>Dados disponíveis para este item ${etiqueta("fato")}</h2>
      ${tabelaHtml([{ t:"Ano" }, { t:"Período" }, { t:"Óbitos no Brasil", num:true }, { t:"Taxa por 100 mil", num:true }, { t:"UFs com registro" }], linhas, { legenda:"Óbitos (SIM) por causa básica" })}
      <ul class="cobertura">
        <li><strong>Óbitos (SIM):</strong> ${sub ? "por estado e Brasil" : "por município, estado e Brasil"}, ${anos[0]}–${anos[anos.length - 1]}. Zero significa nenhum registro com esta causa básica no arquivo publicado, não ausência da condição.</li>
        <li><strong>Internações no SUS (SIH):</strong> ${dispSih.ok && !sub ? "disponíveis por município para este capítulo." : `não disponíveis neste nível. ${h(dispSih.motivo || "As internações foram importadas apenas por capítulo.")} ${causa.cap ? `<a href="${h(linkPara({ rota:"doencas", cid:`cap:${causa.cap}` }))}">Ver o capítulo</a>.` : ""}`}</li>
        <li><strong>Notificações (SINAN):</strong> ${dispDengue.ok ? "casos prováveis de dengue por município." : "não importadas para este item (apenas dengue foi integrada)."}</li>
        <li><strong>Incidência (casos novos na população):</strong> não disponível. Nenhuma das fontes integradas mede casos novos de forma completa.</li>
        <li><strong>Conteúdo explicativo:</strong> ${temas.length ? `${temas.length} ${plural(temas.length, "tema")} da base de conhecimento${temas.some(t => t.relacao === "parcial") ? " (cobrem parte deste item)" : ""}.` : "não há."}</li>
      </ul>${linhaFonte("obitos", sel.ano)}`;

    // Subcategorias da categoria, com óbitos no Brasil no ano selecionado
    if(causa.tipo === "c"){
      const subs = await carregarSubcategorias();
      if(token !== renderToken) return;
      const ano = anos.includes(sel.ano) ? sel.ano : anos[anos.length - 1];
      const br = (await simUFs(ano)).get("BR").cid4;
      const lista = [...subs.values()].filter(s => s.codigo.startsWith(causa.ini));
      const foraDoCatalogo = [...br.keys()].filter(c => c.length === 4 && c.startsWith(causa.ini) && !subs.has(c));
      const semDetalhe = br.get(causa.ini) || 0;
      $("cidSubs").innerHTML = `<div class="card"><h2>Subcategorias</h2>
        ${lista.length || foraDoCatalogo.length ? tabelaHtml([{ t:"Código" }, { t:"Nome" }, { t:`Óbitos no Brasil em ${ano}`, num:true }], [
          ...lista.map(s => [`<a href="${h(linkPara({ rota:"doencas", cid:`s:${s.codigo}` }))}">${h(s.codigo.slice(0, 3))}.${h(s.codigo.slice(3))}</a>`, h(s.nome) + (s.sup ? " <small>(suplemento)</small>" : ""), fmtNum.format(br.get(s.codigo) || 0)]),
          ...foraDoCatalogo.map(c => [`${h(c.slice(0, 3))}.${h(c.slice(3))}`, "<em>Subcategoria usada no SIM, mas ausente da edição de 2008 do catálogo</em>", fmtNum.format(br.get(c))]),
          ...(semDetalhe && lista.length ? [[h(causa.ini), "<em>Registrados só com a categoria (sem quarto caractere)</em>", fmtNum.format(semDetalhe)]] : [])
        ], { legenda:"A soma das subcategorias é igual ao total da categoria: não some os dois." }) : `<p class="nota">Esta categoria não tem subdivisões.</p>`}</div>`;
    }
  }catch(erro){ if(token === renderToken) $("cidCobertura").innerHTML = erroHtml(erro); }
}

function temaHtml(tema, relacao){
  return `<section class="tema">
    <h3>${h(tema.nome)}</h3>
    ${relacao === "parcial" ? `<p class="nota">Este texto vale para uma parte do item selecionado (CID-10 ${tema.cid.map(c => h(c.replace("-", "–"))).join(", ")}).</p>` : ""}
    <p>${h(tema.descricao)}</p>
    ${tema.transmissao ? `<p><strong>Transmissão:</strong> ${h(tema.transmissao)}</p>` : ""}
    <div class="duas-listas">
      <div><h4>Fatores de risco e de agravamento</h4><ul>${tema.risco.map(r => `<li>${h(r)}</li>`).join("")}</ul></div>
      <div><h4>Prevenção</h4><ul>${tema.prevencao.map(r => `<li>${h(r)}</li>`).join("")}</ul></div>
    </div>
    <details class="termo"><summary>Referências (${tema.refs.length})</summary>${refsHtml(tema.refs)}</details>
  </section>`;
}

/* ============================================================
   Fatores e melhorias
   ============================================================ */
const TIPOS_ACAO = { poder_publico:"Ações do poder público", comunidade:"Ações comunitárias", populacao:"Orientações gerais de prevenção" };

/* Bloco de fatores para um município e uma causa. Usado em "Meu município" e em "Fatores e melhorias". */
async function fatoresHtml(mun, causa, evento, ano, { resumo = false } = {}){
  const causaFatores = evento === "dengue" ? lerCausa("c:A90") : causa;
  const temas = temasDaCausa(causaFatores);
  const titulo = `<h2>Fatores a investigar${causaFatores.tipo !== "todas" ? ` — ${h(causaFatores.curto)}` : ""}</h2>`;
  const lacunas = base.dicionario.lacunas.filter(l => l.situacao !== "fora do escopo");
  const faltam = `<details class="termo"><summary>Que dados faltam neste painel</summary><ul>${lacunas.map(l => `<li><strong>${h(l.dimensao)}</strong> (${h(l.situacao)}): ${h(l.motivo)}</li>`).join("")}
    <li><strong>Hábitos e condições individuais</strong> (tabagismo, alimentação, atividade física): não há medida para todos os municípios.</li></ul></details>`;

  if(causaFatores.tipo === "todas"){
    return `<div class="card">${titulo}<p>Escolha uma doença ou grupo para ver os fatores relacionados a ela. Para “todas as causas” não há uma relação específica a mostrar.</p>
      <p><a href="${h(linkPara({ rota:"fatores" }))}">Ver o perfil do território</a></p></div>`;
  }
  if(!temas.length){
    return `<div class="card">${titulo}
      <div class="nota nota-indisponivel"><strong>Não há evidência suficiente para explicar este padrão com os dados disponíveis.</strong>
      O painel não tem relações documentadas e revisadas entre <em>${h(causaFatores.rotulo)}</em> e os indicadores territoriais. A classificação CID, sozinha, não explica causas no território.</div>
      ${faltam}<p>Você ainda pode consultar os números desta causa, o <a href="${h(linkPara({ rota:"fatores" }))}">perfil do território</a> e a <a href="${h(linkPara({ rota:"doencas", cid: causaFatores.id }))}">ficha na CID</a>.</p></div>`;
  }

  const blocos = [];
  let emAtencao = 0, comDado = 0;
  for(const { tema, relacao } of temas){
    const cartoes = tema.fatores.map((fator, i) => {
      const ind = mun ? indicadorLocal(mun, fator.indicador) : null;
      const def = base.indPorId.get(fator.indicador);
      const at = ind ? atencaoFator(ind, fator.atencao) : null;
      if(ind?.disponivel) comDado++;
      if(at?.nivel === "atencao") emAtencao++;
      const defasagem = Number(ano) - def.ano;
      const acoes = fator.acoes.map(id => ({ id, ...base.conhecimento.acoes[id] }));
      const local = !mun ? `<p class="nota">Escolha um município para ver o valor local deste indicador. Sem ele, o que aparece aqui é apenas informação geral.</p>`
        : ind.disponivel ? `<div class="fator-local">
            <p>${etiqueta("fato")} <strong>${h(def.nome)}:</strong> <span class="valor">${fmtValor(ind.valor, def.casas)} ${h(def.unidade)}</span> em ${def.ano}
              <small>· ${h(UF_NAMES[ufDe(mun)])}: ${fmtValor(ind.refUF, def.casas)} · Brasil: ${fmtValor(ind.refBR, def.casas)}${def.ref_tipo.startsWith("mediana") ? " (medianas dos municípios)" : ""}</small></p>
            <p>${etiqueta("comparacao")} <span class="selo selo-${at.nivel === "atencao" ? "acima" : at.nivel === "favoravel" ? "abaixo" : "neutro"}">${at.nivel === "atencao" ? "Merece atenção" : at.nivel === "favoravel" ? "Situação relativamente favorável" : "Faixa intermediária"}</span> ${h(at.texto)}
              Maior que ${Math.round(ind.percentilUF)}% dos ${ind.nUF} municípios da UF.</p>
            ${defasagem !== 0 ? `<p class="nota">Defasagem: o indicador é de ${def.ano} e os eventos de saúde são de ${h(ano)}. Serve como contexto, não como medição do mesmo momento.</p>` : ""}
          </div>`
        : `<p class="nota"><strong>Indicador sem valor para este município:</strong> ${h(motivoSemIndicador(mun, fator.indicador))}. Não foi usado valor do estado ou de outro município no lugar.</p>`;
      return `<article class="fator">
        <h4>${h(def.nome)} <small>${h(fator.papel)}</small></h4>
        ${local}
        <p>${etiqueta("literatura")} <strong>Por que investigar:</strong> ${h(fator.porque)}</p>
        ${at?.nivel === "atencao" ? `<p>${etiqueta("hipotese")} O valor local é desfavorável e este fator é reconhecido para a condição. É uma hipótese a investigar com a vigilância local, não uma causa comprovada dos registros deste município.</p>` : ""}
        ${mun ? `<div class="assoc" data-ind="${h(fator.indicador)}" data-causa="${h(causaFatores.id)}"><button class="btn ghost no-print" type="button">Ver associação entre os municípios da UF</button></div>` : ""}
        <p class="limites"><strong>Limitações:</strong> ${h(fator.limitacoes)} ${h(def.limitacoes || "")}</p>
        ${acoes.length ? `<details class="termo acoes-det"${at?.nivel === "atencao" ? " open" : ""}><summary>Melhorias e prevenção relacionadas (${acoes.length})</summary>
          ${Object.entries(TIPOS_ACAO).map(([tipo, nome]) => { const doTipo = acoes.filter(a => a.tipo === tipo); return doTipo.length ? `<h5>${h(nome)}</h5>${doTipo.map(a => `<div class="acao"><p>${h(a.texto)}</p>
            <p class="limites"><strong>Problema que enfrenta:</strong> ${h(a.problema)} <strong>Limite:</strong> ${h(a.limitacoes)}</p>${refsHtml(a.refs)}</div>`).join("")}` : ""; }).join("")}
        </details>` : ""}
        <details class="termo"><summary>Fonte do indicador e referências</summary><p>${h(def.definicao)} Fonte: ${h(def.tabela)}, ${def.ano}. Cobertura: ${fmtNum.format(def.cobertura.municipios_com_valor)} de ${fmtNum.format(def.cobertura.municipios_total)} municípios.</p>${refsHtml(fator.refs)}</details>
      </article>`;
    });
    blocos.push(`<section class="tema-fatores"><h3>${h(tema.nome)}</h3>
      ${relacao === "parcial" ? `<p class="nota">Tema que cobre parte do item selecionado (CID-10 ${tema.cid.map(c => h(c.replace("-", "–"))).join(", ")}).</p>` : ""}
      ${cartoes.join("")}</section>`);
  }
  const sintese = !mun ? `<p class="nota">Sem município selecionado: o conteúdo abaixo é informação geral da literatura.</p>`
    : emAtencao ? `<div class="nota nota-atencao"><strong>${emAtencao} de ${comDado} ${plural(comDado, "indicador disponível", "indicadores disponíveis")} ${emAtencao === 1 ? "está" : "estão"} em situação desfavorável</strong> em relação aos municípios da UF.
        São pontos de partida para investigação. Dados agregados não mostram se as pessoas que adoeceram eram as expostas, e uma relação conhecida na literatura não prova que ela explica os números deste município.</div>`
    : `<div class="nota nota-indisponivel"><strong>Não há evidência suficiente para explicar este padrão com os dados disponíveis.</strong>
        Nenhum dos ${comDado} indicadores territoriais ligados a esta condição está em situação desfavorável neste município em relação à UF. Isso não descarta os fatores: os indicadores são indiretos e vários determinantes não têm dado municipal.</div>`;
  return `<div class="card">${titulo}
    <p class="sub">Cada bloco separa o que foi ${etiqueta("fato")} no município, o que é ${etiqueta("comparacao")} feita pelo painel, o que é ${etiqueta("literatura")} e o que é ${etiqueta("hipotese")}.</p>
    ${sintese}${faltam}
    ${resumo ? "" : ""}${blocos.join("")}
    <p class="hint">A ordem dos fatores segue a base de conhecimento (fatores mais diretos primeiro); não é um ranking de causas.</p></div>`;
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
      if(!disp.ok){ caixa.innerHTML = `<p class="nota">Associação não calculada: ${h(disp.motivo)}</p>`; return; }
      const r = await associacao(uf, causa, sel.evento, sel.ano, caixa.dataset.ind);
      if(!r.suficiente){
        caixa.innerHTML = `<p class="nota">${etiqueta("associacao")} Amostra insuficiente: apenas ${r.n} municípios de ${h(UF_NAMES[uf])} com 10 mil habitantes ou mais e dados completos (mínimo adotado: 30). A correlação não foi calculada.</p>`;
        return;
      }
      const forca = Math.abs(r.rho) < 0.1 ? "praticamente nula" : Math.abs(r.rho) < 0.3 ? "fraca" : Math.abs(r.rho) < 0.5 ? "moderada" : "forte";
      const incerta = r.ic[0] <= 0 && r.ic[1] >= 0;
      caixa.innerHTML = `<div class="assoc-resultado"><p>${etiqueta("associacao")} Entre <strong>${r.n}</strong> municípios de ${h(UF_NAMES[uf])}, a correlação de postos (Spearman) entre <em>${h(def.nome)}</em> (${def.ano}) e a ${h(ev.taxa.toLowerCase())} (${h(sel.ano)}) é
        <strong>${fmt2.format(r.rho)}</strong> (intervalo de 95%: ${fmt2.format(r.ic[0])} a ${fmt2.format(r.ic[1])}) — ${incerta ? "o intervalo inclui zero: não dá para afirmar que exista associação" : `associação ${forca} e ${r.rho > 0 ? "positiva (taxas maiores onde o indicador é maior)" : "negativa (taxas menores onde o indicador é maior)"}`}.</p>
        <p class="limites">Método: taxas brutas por município; excluídos ${r.excluidosPop} municípios com menos de 10 mil habitantes (taxas instáveis) e ${r.excluidosSemValor} sem dado. Não há ajuste por idade, renda ou outros fatores (confundimento), nem por vizinhança entre municípios; os anos do indicador e dos eventos são diferentes.
        Como vários indicadores são testados, algumas correlações aparecem por acaso. <strong>Correlação entre municípios não prova causa</strong> e não vale para indivíduos.</p></div>`;
    }catch(erro){ caixa.innerHTML = `<p class="nota nota-erro">Não foi possível calcular: ${h(erro.message)}</p>`; }
  }));
}

async function renderFatores(el, token){
  const causa = lerCausa(sel.causa);
  const mun = sel.mun && base.munPorCodigo.has(sel.mun) ? sel.mun : "";
  const dic = base.dicionario;
  let perfil;
  if(mun){
    perfil = dic.dimensoes.map(dim => {
      const inds = dic.indicadores.filter(i => i.dimensao === dim);
      return `<h3>${h(dim)}</h3>${tabelaHtml(
        [{ t:"Indicador" }, { t:"Ano" }, { t:"Município", num:true }, { t: ufDe(mun), num:true }, { t:"Brasil", num:true }, { t:"Posição na UF" }],
        inds.map(i => {
          const il = indicadorLocal(mun, i.id);
          return [`${h(i.nome)} <small>(${h(i.unidade)})</small>${termo("Definição e limites", `${i.definicao} ${i.limitacoes || ""} Fonte: ${i.tabela}.`)}`, String(i.ano),
            il.disponivel ? fmtValor(il.valor, i.casas) : h(motivoSemIndicador(mun, i.id)), fmtValor(il.refUF, i.casas), fmtValor(il.refBR, i.casas),
            il.disponivel ? `maior que ${Math.round(il.percentilUF)}% dos municípios` : "—"];
        }), { legenda:`${dim} — valores do município e referências${inds.some(i => i.ref_tipo.startsWith("mediana")) ? " (para focos de calor, as referências são medianas dos municípios)" : ""}` })}`;
    }).join("");
  }
  el.innerHTML = `<div class="card">
      <h1>Fatores e melhorias</h1>
      <p>Condições do território que podem contribuir para adoecimento e morte, com os dados locais disponíveis, as relações descritas em fontes de referência e as ações coletivas pertinentes.
      O painel não atribui “probabilidade de causa” nem ordena culpados: mostra o que se sabe, o que foi medido e o que falta.</p>
      ${mun ? "" : `<p class="nota">Escolha um município na barra de seleção para ver os valores locais.</p>`}
    </div>
    <div id="fatBloco">${carregandoHtml("Montando os fatores...")}</div>
    ${mun ? `<div class="card"><h2>Perfil do território — ${h(nomeLocal(mun))} ${etiqueta("fato")}</h2>
      <p class="sub">Indicadores municipais de fontes oficiais. “Posição na UF” é relativa e não diz, sozinha, se o valor é bom ou ruim.</p>${perfil}
      <button id="perfilCsv" class="btn ghost no-print" type="button">Exportar CSV</button></div>` : ""}
    <div class="card"><h2>O que ainda não está no painel</h2>
      <p>Estas dimensões foram avaliadas e não têm indicador municipal integrado. Elas não aparecem como zero nem são preenchidas com valores de estados ou capitais.</p>
      ${tabelaHtml([{ t:"Dimensão" }, { t:"Situação" }, { t:"Motivo verificado" }], dic.lacunas.map(l => [h(l.dimensao), h(l.situacao), h(l.motivo)]), { legenda:"Lacunas de dados" })}
    </div>`;
  $("perfilCsv")?.addEventListener("click", () => baixarCSV(`perfil_${mun}.csv`,
    [["indicador", "dimensao", "unidade", "ano", "municipio", "uf", "brasil", "fonte"], ...dic.indicadores.map(i => { const il = indicadorLocal(mun, i.id);
      return [i.nome, i.dimensao, i.unidade, i.ano, il.valor ?? "indisponível", il.refUF ?? "", il.refBR ?? "", i.tabela]; })],
    [`Município: ${nomeLocal(mun)} (${mun})`, "Valores vazios ou 'indisponível' não são zero.", `Dados versão ${DATA_VERSION}`]));
  try{
    const html = await fatoresHtml(mun, causa, sel.evento, sel.ano);
    if(token !== renderToken) return;
    $("fatBloco").innerHTML = html;
    ligarFatores($("fatBloco"));
  }catch(erro){ $("fatBloco").innerHTML = erroHtml(erro); }
}

/* ============================================================
   Fontes e metodologia
   ============================================================ */
async function renderFontes(el, token){
  el.innerHTML = carregandoHtml("Carregando os manifestos das fontes...");
  let manifestos, cobertura;
  try{ [manifestos, cobertura] = await Promise.all([fetchJSON(PATHS.manifestos), fetchJSON(PATHS.cobertura)]); }
  catch(erro){ el.innerHTML = erroHtml(erro); return; }
  if(token !== renderToken) return;
  const lista = v => Array.isArray(v) ? v : [v];
  el.innerHTML = `<div class="card">
      <h1>Fontes e metodologia</h1>
      <p>Todos os números vêm de fontes públicas oficiais, preparados por scripts reproduzíveis que ficam no repositório (pasta <code>scripts/</code>). Dados atualizados em ${h(formatarData(cobertura.gerado_em))} (versão ${h(DATA_VERSION)}).</p>
    </div>
    <div class="card"><h2>Como os indicadores são calculados</h2>
      <dl class="formulas">
        <dt>Contagem</dt><dd>Número de eventos registrados no período, por município de residência.</dd>
        <dt>Taxa de mortalidade</dt><dd>óbitos ÷ população × 100.000. População: estimativa do IBGE do mesmo ano (2024 a 2026); para 2023, Censo 2022, com aviso de defasagem.</dd>
        <dt>Taxa de internações no SUS</dt><dd>internações pagas pelo SUS ÷ população × 100.000. Conta internações, não pessoas, e não cobre a rede privada.</dd>
        <dt>Taxa de notificações de dengue</dt><dd>casos prováveis notificados ÷ população × 100.000. Não é chamada de incidência porque depende da notificação.</dd>
        <dt>Participação</dt><dd>eventos de uma causa ÷ total de eventos do mesmo local, tipo e período. O universo é sempre informado.</dd>
        <dt>Recorte por sexo e idade</dt><dd>Só para óbitos por capítulo ou total: numerador e denominador (Censo 2022) do mesmo sexo e faixa de idade. Sem denominador compatível, a taxa não é calculada.</dd>
        <dt>Comparação com a referência</dt><dd>Esperado = taxa da UF × população do município. Razão = observado ÷ esperado, com intervalo de 95% de Poisson (aproximação de Byar; Breslow e Day, 1987). “Acima” ou “abaixo” apenas quando todo o intervalo fica de um lado de 1; com menos de 10 eventos há aviso de instabilidade.</dd>
        <dt>Padronização indireta por idade e sexo</dt><dd>Esperado = soma, em cada sexo e faixa de 5 anos, de (taxa da UF × população do município), com populações do Censo 2022. Disponível para óbitos por capítulo e total.</dd>
        <dt>Municípios comparáveis</dt><dd>Mesma UF e mesma classe de porte populacional (7 classes). A posição (percentil) é relativa; exige ao menos 8 municípios no grupo.</dd>
        <dt>Mapa</dt><dd>Taxa do local ÷ taxa do Brasil em 5 classes fixas. Locais com menos de ${MIN_EVENTOS_MAPA} eventos observados e esperados ficam em cinza (taxa instável). A regra antiga de “20 óbitos” foi substituída por esta, que depende do tamanho esperado do evento.</dd>
        <dt>Associação exploratória</dt><dd>Correlação de postos de Spearman entre a taxa bruta e o indicador, nos municípios da mesma UF com 10 mil habitantes ou mais; mínimo de 30 municípios; intervalo de 95% pela transformação de Fisher. Sem ajuste por confundimento, sazonalidade ou dependência espacial.</dd>
        <dt>Fator “merece atenção”</dt><dd>Indicador local no quarto mais desfavorável dos municípios da UF, no sentido indicado pela literatura. É um critério de triagem, não uma prova.</dd>
      </dl>
      <h3>Regras gerais</h3>
      <ul>
        <li>Anos parciais (prévias) não são projetados para 12 meses nem comparados a anos completos sem aviso.</li>
        <li>Eventos de sistemas diferentes (óbitos, internações, notificações) nunca são somados.</li>
        <li>Zero observado, dado indisponível e dado suprimido são mostrados de forma diferente; ausência de registro não é tratada como zero de doença.</li>
        <li>Indicadores de estados ou capitais não são atribuídos a municípios.</li>
        <li>Códigos municipais: IBGE de 7 dígitos; fontes com 6 dígitos são convertidas pela tabela oficial. Fontes só com nome são resolvidas por nome exato e UF, sem aproximação.</li>
        <li><strong>Privacidade:</strong> o painel publica apenas contagens agregadas. A tabela de registros individuais da versão anterior foi removida. O detalhe por sexo e idade existe só no nível de capítulo; categorias aparecem apenas como total do município, como no tabulador público do Ministério da Saúde. Não foi adotado um limiar único de supressão: as contagens pequenas vêm de bases já públicas e são acompanhadas de aviso de instabilidade.</li>
      </ul>
    </div>
    <div class="card"><h2>Cobertura real dos dados</h2>
      ${tabelaHtml([{ t:"Fonte" }, { t:"Desfecho ou indicador" }, { t:"Período" }, { t:"Nível territorial" }, { t:"Cobertura" }, { t:"Situação" }],
        cobertura.matriz.map(l => [h(l.fonte), h(l.desfecho), h(l.periodo), h(l.nivel), h(l.cobertura), h(l.situacao)]), { legenda:"Matriz de cobertura por fonte, desfecho, período e nível territorial" })}
      <p>Relatórios de validação (junções, códigos não resolvidos, totais): ${cobertura.relatorios.map(r => `<a href="${h(r)}" target="_blank" rel="noopener">${h(r.split("/").pop())}</a>`).join(" · ")}</p>
    </div>
    <div class="card"><h2>Manifestos das fontes</h2>
      ${manifestos.fontes.map(m => `<details class="manifesto"><summary><strong>${h(m.titulo)}</strong> <small>${h(m.instituicao)}</small></summary>
        <dl>
          <dt>Página</dt><dd><a href="${h(urlSegura(m.pagina))}" target="_blank" rel="noopener noreferrer">${h(m.pagina)}</a></dd>
          <dt>Recursos usados</dt><dd><ul>${lista(m.recursos).slice(0, 12).map(r => `<li class="quebra">${h(r)}</li>`).join("")}${lista(m.recursos).length > 12 ? `<li>… e mais ${lista(m.recursos).length - 12}</li>` : ""}</ul></dd>
          <dt>Licença ou condições</dt><dd>${h(m.licenca)}</dd>
          <dt>Versão</dt><dd>${h(m.versao)}</dd>
          <dt>Período de referência</dt><dd>${h(m.periodo_referencia)}</dd>
          <dt>Coletado em</dt><dd>${h(formatarData(m.coletado_em))}</dd>
          <dt>Granularidade</dt><dd>${h(m.granularidade)}</dd>
          <dt>Unidade</dt><dd>${h(m.unidade)}</dd>
          <dt>Definição</dt><dd>${h(m.definicao)}</dd>
          <dt>Cobertura</dt><dd>${h(m.cobertura)}</dd>
          <dt>Campos</dt><dd><ul>${Object.entries(m.campos || {}).map(([k, v]) => `<li><code>${h(k)}</code>: ${h(v)}</li>`).join("")}</ul></dd>
          <dt>Valores ausentes</dt><dd>${h(m.valores_ausentes)}</dd>
          <dt>Limitações</dt><dd>${h(m.limitacoes)}</dd>
          <dt>Atualização</dt><dd><code>${h(m.comando_atualizacao)}</code></dd>
        </dl></details>`).join("")}
    </div>
    <div class="card"><h2>Referências de conteúdo</h2>
      <p>${h(base.conhecimento.meta.natureza)} Endereços verificados em ${h(formatarData(base.conhecimento.meta.enderecos_verificados_em))}.</p>
      ${refsHtml(Object.keys(base.conhecimento.referencias))}
    </div>`;
}

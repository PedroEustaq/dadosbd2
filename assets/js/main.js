/* ============================================================
   Inicialização, navegação por endereço (hash) e barra de seleção
   ------------------------------------------------------------
   A seleção inteira fica no endereço da página:
     #/municipio?m=3509502&c=g:I20-I25&e=obitos&a=2024
   Assim o link pode ser compartilhado e o botão "voltar" funciona.
   ============================================================ */
let renderToken = 0;   // cada renderização recebe um número; respostas antigas são descartadas
let rotaAnterior = "";

const ROTAS = {
  inicio: { titulo:"Visão geral", render: (...a) => renderInicio(...a) },
  mapa: { titulo:"Explorar o mapa", render: (...a) => renderMapa(...a) },
  municipio: { titulo:"Meu município", render: (...a) => renderMunicipio(...a) },
  doencas: { titulo:"Doenças e CID", render: (...a) => renderDoencas(...a) },
  comparar: { titulo:"Comparar locais", render: (...a) => renderComparar(...a) },
  fatores: { titulo:"Fatores e melhorias", render: (...a) => renderFatores(...a) },
  fontes: { titulo:"Fontes e metodologia", render: (...a) => renderFontes(...a) }
};

function anoPadrao(evento){
  const anos = anosDe(evento);
  const completos = anos.filter(a => infoAno(evento, a).ano_completo);
  return completos[completos.length - 1] || anos[anos.length - 1];
}

/* ---------- Endereço ⇄ seleção ---------- */
function hashDe(s){
  const p = new URLSearchParams();
  if(s.mun) p.set("m", s.mun);
  if(s.causa && s.causa !== "todas") p.set("c", s.causa);
  if(s.evento !== "obitos") p.set("e", s.evento);
  if(s.ano && s.ano !== anoPadrao(s.evento)) p.set("a", s.ano);
  if(s.sexo) p.set("s", s.sexo);
  if(s.idade) p.set("i", s.idade);
  if(s.comparar?.length) p.set("cmp", s.comparar.join(","));
  if(s.cid && s.rota === "doencas") p.set("cid", s.cid);
  const q = p.toString();
  return `#/${s.rota}${q ? `?${q}` : ""}`;
}

function linkPara(patch){
  const novo = { ...sel, ...patch };
  if(patch.evento && patch.evento !== sel.evento && !patch.ano && !anosDe(patch.evento).includes(novo.ano)) novo.ano = anoPadrao(patch.evento);
  return hashDe(novo);
}

function navegar(patch){
  const destino = linkPara(patch);
  if(location.hash === destino) renderizar();
  else location.hash = destino;
}

function lerHash(){
  const [caminho, consulta = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const p = new URLSearchParams(consulta);
  sel.rota = ROTAS[caminho] ? caminho : "inicio";
  sel.mun = base.munPorCodigo.has(p.get("m")) ? p.get("m") : "";
  sel.evento = EVENTOS[p.get("e")] ? p.get("e") : "obitos";
  sel.causa = lerCausa(p.get("c") || "todas").id;
  sel.ano = anosDe(sel.evento).includes(p.get("a")) ? p.get("a") : anoPadrao(sel.evento);
  sel.sexo = ["M", "F"].includes(p.get("s")) ? p.get("s") : "";
  sel.idade = GRUPOS_IDADE[p.get("i")] ? p.get("i") : "";
  sel.comparar = (p.get("cmp") || "").split(",").filter(l => UF_NAMES[l] || base.munPorCodigo.has(l)).slice(0, 6);
  sel.cid = p.get("cid") || "";
}

/* ---------- Renderização ---------- */
async function renderizar(){
  if(!base.pronto) return;
  lerHash();
  const token = ++renderToken;
  const rota = ROTAS[sel.rota];
  document.title = `${rota.titulo} — Saúde no Território`;
  document.querySelectorAll(".view").forEach(v => { v.hidden = v.id !== `view-${sel.rota}`; });
  document.querySelectorAll("#nav a").forEach(a => {
    if(a.dataset.rota === sel.rota) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  $("selbar").hidden = sel.rota === "fontes";
  atualizarBarra();
  const el = $(`view-${sel.rota}`);
  const mudouRota = rotaAnterior !== sel.rota;
  if(window.matchMedia("(max-width: 760px)").matches && document.activeElement?.closest?.("#selDet") == null) $("selDet").open = false;
  if(mudouRota){
    if(rotaAnterior){ window.scrollTo(0, 0); $("conteudo").focus({ preventScroll:true }); }
    rotaAnterior = sel.rota;
    fecharMenu();
  }
  try{
    await rota.render(el, token);
  }catch(erro){
    if(token === renderToken && sel.rota !== "mapa") el.innerHTML = erroHtml(erro);
    else console.error(erro);
  }
}

/* ---------- Barra de seleção ---------- */
function atualizarBarra(){
  const causa = lerCausa(sel.causa);
  const ev = EVENTOS[sel.evento];
  if(document.activeElement !== $("munInput")) $("munInput").value = sel.mun ? nomeLocal(sel.mun) : "";
  if(document.activeElement !== $("causaInput")) $("causaInput").value = sel.evento === "dengue" ? "Dengue (notificações)" : (causa.tipo === "todas" ? "" : causa.rotulo);
  $("causaInput").disabled = sel.evento === "dengue";
  $("eventoSel").value = sel.evento;
  $("anoSel").innerHTML = anosDe(sel.evento).map(a => {
    const info = infoAno(sel.evento, a);
    return `<option value="${a}"${a === sel.ano ? " selected" : ""}>${a}${info.ano_completo ? "" : ` — parcial (${h(info.periodo.split(" (")[0])})`}</option>`;
  }).join("");
  $("sexoSel").value = sel.sexo;
  $("idadeSel").value = sel.idade;
  $("eventoExplica").textContent = ev.explica;

  const chips = [];
  const chip = (texto, patch, rotulo) => chips.push(`<button class="chip" type="button" data-patch='${h(JSON.stringify(patch))}' aria-label="Remover filtro: ${h(rotulo || texto)}">${h(texto)} <span aria-hidden="true">×</span></button>`);
  if(sel.mun) chip(nomeLocal(sel.mun), { mun:"" });
  if(sel.evento !== "dengue" && causa.tipo !== "todas") chip(causa.rotulo.length > 60 ? `${causa.rotulo.slice(0, 58)}…` : causa.rotulo, { causa:"todas" }, causa.rotulo);
  if(sel.evento !== "obitos") chip(ev.rotulo, { evento:"obitos", ...(sel.evento === "dengue" ? { causa:"todas" } : {}) });
  if(sel.ano !== anoPadrao(sel.evento)) chip(`Período: ${sel.ano}`, { ano: anoPadrao(sel.evento) });
  if(sel.sexo) chip(sel.sexo === "F" ? "Sexo feminino" : "Sexo masculino", { sexo:"" });
  if(sel.idade) chip(GRUPOS_IDADE[sel.idade].rotulo, { idade:"" });
  $("chips").innerHTML = chips.length ? chips.join("") : `<span class="hint">Nenhum filtro aplicado: Brasil, todas as causas, óbitos, ${h(sel.ano)}.</span>`;
  $("limparBtn").disabled = !chips.length;
  if(sel.sexo || sel.idade) $("avancados").open = true;
}

/* ---------- Caixa de busca com sugestões (combobox acessível) ---------- */
function criarCombobox(input, lista, buscar, aoEscolher, { limparAoEscolher = false } = {}){
  let itens = [], ativo = -1, valorInicial = "";
  const fechar = () => { lista.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); ativo = -1; };
  const marcar = indice => {
    ativo = indice;
    [...lista.children].forEach((li, i) => li.setAttribute("aria-selected", i === ativo ? "true" : "false"));
    if(ativo >= 0){
      input.setAttribute("aria-activedescendant", lista.children[ativo].id);
      lista.children[ativo].scrollIntoView({ block:"nearest" });
    }else input.removeAttribute("aria-activedescendant");
  };
  const escolher = indice => {
    const item = itens[indice];
    if(!item) return;
    input.value = limparAoEscolher ? "" : item.texto;
    fechar();
    input.blur();
    aoEscolher(item);
  };
  const abrir = () => {
    const texto = input.value.trim();
    itens = texto ? buscar(texto) : [];
    if(!texto){ fechar(); return; }
    lista.innerHTML = itens.length
      ? itens.map((item, i) => `<li id="${lista.id}-${i}" role="option" aria-selected="false" data-i="${i}"><span>${h(item.titulo)}</span><small>${h(item.detalhe || "")}</small></li>`).join("")
      : `<li class="combo-vazio" role="option" aria-disabled="true">Nenhum resultado para “${h(texto)}”. Confira a grafia ou tente outro termo.</li>`;
    lista.hidden = false;
    input.setAttribute("aria-expanded", "true");
    marcar(itens.length ? 0 : -1);
  };
  input.addEventListener("focus", () => { valorInicial = input.value; input.select(); });
  input.addEventListener("input", debounce(abrir, 80));
  input.addEventListener("keydown", e => {
    if(e.key === "ArrowDown"){ e.preventDefault(); if(lista.hidden) abrir(); else if(itens.length) marcar((ativo + 1) % itens.length); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); if(itens.length) marcar((ativo - 1 + itens.length) % itens.length); }
    else if(e.key === "Enter"){ if(!lista.hidden && itens.length){ e.preventDefault(); escolher(Math.max(ativo, 0)); } }
    else if(e.key === "Escape"){ if(!lista.hidden){ e.preventDefault(); fechar(); } input.value = valorInicial; }
  });
  input.addEventListener("blur", () => setTimeout(() => { fechar(); if(input.value !== valorInicial && document.activeElement !== input) atualizarBarra(); }, 150));
  lista.addEventListener("mousedown", e => {
    const li = e.target.closest("li[data-i]");
    if(li){ e.preventDefault(); escolher(Number(li.dataset.i)); }
  });
}

function fecharMenu(){
  $("nav").classList.remove("aberto");
  $("menuToggle").setAttribute("aria-expanded", "false");
}

function ligarEventos(){
  criarCombobox($("munInput"), $("munLista"), opcoesMunicipio, item => navegar({ mun:item.valor, ...(sel.rota === "inicio" ? { rota:"municipio" } : {}) }));
  criarCombobox($("causaInput"), $("causaLista"), opcoesCausa, item => navegar({ causa:item.valor }));
  $("eventoSel").innerHTML = Object.entries(EVENTOS).map(([id, e]) => `<option value="${id}">${h(e.rotulo)}</option>`).join("");
  $("idadeSel").innerHTML = Object.entries(GRUPOS_IDADE).map(([id, g]) => `<option value="${id}">${h(g.rotulo)}</option>`).join("");
  $("eventoSel").addEventListener("change", e => {
    const evento = e.target.value;
    // As notificações integradas são só de dengue: a causa acompanha o evento.
    navegar({ evento, ...(evento === "dengue" ? { causa:"c:A90" } : (sel.evento === "dengue" ? { causa:"todas" } : {})) });
  });
  $("anoSel").addEventListener("change", e => navegar({ ano: e.target.value }));
  $("sexoSel").addEventListener("change", e => navegar({ sexo: e.target.value }));
  $("idadeSel").addEventListener("change", e => navegar({ idade: e.target.value }));
  $("chips").addEventListener("click", e => {
    const botao = e.target.closest("[data-patch]");
    if(botao) navegar(JSON.parse(botao.dataset.patch));
  });
  $("limparBtn").addEventListener("click", () => navegar({ mun:"", causa:"todas", evento:"obitos", ano: anoPadrao("obitos"), sexo:"", idade:"" }));
  $("linkBtn").addEventListener("click", async () => {
    const botao = $("linkBtn");
    try{
      await navigator.clipboard.writeText(location.href);
      botao.textContent = "Link copiado";
    }catch{
      prompt("Copie o endereço desta seleção:", location.href);
    }
    setTimeout(() => { botao.textContent = "Copiar link desta seleção"; }, 2500);
  });
  $("mapFocusSel").addEventListener("change", e => setMapView(e.target.value));
  $("menuToggle").addEventListener("click", () => {
    const aberto = $("nav").classList.toggle("aberto");
    $("menuToggle").setAttribute("aria-expanded", String(aberto));
  });
  // Celular: a barra de seleção começa recolhida (os filtros aplicados continuam visíveis).
  const estreita = window.matchMedia("(max-width: 760px)");
  const ajustarSelecao = () => { $("selDet").open = !estreita.matches; };
  ajustarSelecao();
  estreita.addEventListener("change", ajustarSelecao);
  window.addEventListener("hashchange", renderizar);
}

async function iniciar(){
  try{
    await carregarBase();
  }catch(erro){
    console.error(erro);
    setStatus(`Não foi possível carregar os dados de referência (${erro.message}). Se você abriu o arquivo direto do disco, use um servidor local: python3 -m http.server 8000. Depois recarregue a página.`, "error");
    return;
  }
  setStatus("", "success");
  ligarEventos();
  renderizar();
}

iniciar();

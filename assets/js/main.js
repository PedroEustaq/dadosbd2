/* ============================================================
   Inicialização, navegação por endereço (hash) e consulta ativa
   ------------------------------------------------------------
   A seleção inteira fica no endereço da página:
     #/municipio?m=3509502&c=g:I20-I25&e=obitos&a=2024
   Assim o link pode ser compartilhado e o botão "voltar" funciona.

   Navegação por tarefas: Explorar (entrada, análise municipal, fatores e
   mapa), Doenças, Comparar e, como destino secundário, Fontes.
   ============================================================ */
let renderToken = 0;   // cada renderização recebe um número; respostas antigas são descartadas
let rotaAnterior = "";

const ROTAS = {
  inicio: { titulo:"Explorar", grupo:"explorar", render: (...a) => renderInicio(...a) },
  mapa: { titulo:"Mapa", grupo:"explorar", consulta:["causa", "evento", "ano"], render: (...a) => renderMapa(...a) },
  municipio: { titulo:"Análise municipal", grupo:"explorar", consulta:["mun", "causa", "evento", "ano", "sexo", "idade"], render: (...a) => renderMunicipio(...a) },
  fatores: { titulo:"Fatores e melhorias", grupo:"explorar", consulta:["mun", "causa", "evento", "ano"], render: (...a) => renderFatores(...a) },
  doencas: { titulo:"Doenças e CID", grupo:"doencas", render: (...a) => renderDoencas(...a) },
  comparar: { titulo:"Comparar locais", grupo:"comparar", consulta:["causa", "evento", "ano", "sexo", "idade"], render: (...a) => renderComparar(...a) },
  fontes: { titulo:"Fontes e metodologia", grupo:"fontes", render: (...a) => renderFontes(...a) }
};
const VISOES = ["", "evolucao", "causas"];

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
  if(s.visao && s.rota === "municipio") p.set("v", s.visao);
  const q = p.toString();
  return `#/${s.rota}${q ? `?${q}` : ""}`;
}

function linkPara(patch){
  const novo = { ...sel, ...patch };
  if(patch.evento && patch.evento !== sel.evento && !patch.ano && !anosDe(patch.evento).includes(novo.ano)) novo.ano = anoPadrao(patch.evento);
  if(patch.rota && patch.rota !== sel.rota && patch.visao === undefined) novo.visao = "";
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
  sel.visao = VISOES.includes(p.get("v")) ? p.get("v") : "";
}

/* ---------- Renderização ---------- */
async function renderizar(){
  if(!base.pronto) return;
  lerHash();
  const token = ++renderToken;
  const rota = ROTAS[sel.rota];
  document.title = `${rota.titulo} — Saúde no Território`;
  document.body.dataset.rota = sel.rota;
  document.querySelectorAll(".view").forEach(v => { v.hidden = v.id !== `view-${sel.rota}`; });

  // A navegação leva a seleção junto: trocar de área não apaga a consulta.
  const destinos = {
    explorar: linkPara({ rota: sel.mun ? "municipio" : "inicio" }),
    doencas: linkPara({ rota:"doencas", cid:"" }),
    comparar: linkPara({ rota:"comparar" }),
    fontes: linkPara({ rota:"fontes" })
  };
  document.querySelectorAll("#nav a").forEach(a => {
    a.href = destinos[a.dataset.grupo];
    if(a.dataset.grupo === rota.grupo) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.querySelector(".marca").href = linkPara({ rota:"inicio" });
  atualizarConsulta();

  const el = $(`view-${sel.rota}`);
  if(rotaAnterior !== sel.rota){
    fecharConsulta(false);
    if(rotaAnterior){ window.scrollTo(0, 0); $("conteudo").focus({ preventScroll:true }); }
    rotaAnterior = sel.rota;
  }
  try{
    await rota.render(el, token);
  }catch(erro){
    if(token === renderToken && sel.rota !== "mapa") el.innerHTML = erroHtml(erro);
    else console.error(erro);
  }
}

/* ---------- Consulta ativa (linha compacta + painel de edição) ---------- */
const ROTULO_CAMPO = { mun:"Município", causa:"Doença ou grupo", evento:"Evento", ano:"Período", recorte:"Recorte" };

function atualizarConsulta(){
  const rota = ROTAS[sel.rota];
  const campos = rota.consulta;
  $("consulta").hidden = !campos;
  if(!campos) return;
  const causa = lerCausa(sel.causa);
  const info = infoAno(sel.evento, sel.ano);
  const valores = {
    mun: sel.mun ? nomeLocal(sel.mun) : "Escolher município",
    causa: sel.evento === "dengue" ? "Dengue" : (causa.tipo === "todas" ? "Todas as causas" : causa.curto),
    evento: EVENTOS[sel.evento].rotulo,
    ano: `${sel.ano}${info && !info.ano_completo ? " (parcial)" : ""}`
  };
  const recorte = [sel.sexo === "F" ? "Feminino" : sel.sexo === "M" ? "Masculino" : "", sel.idade ? GRUPOS_IDADE[sel.idade].rotulo : ""].filter(Boolean).join(", ");
  const itens = campos.filter(c => valores[c]).map(c => [c, valores[c]]);
  if(recorte && campos.includes("sexo")) itens.push(["recorte", recorte]);
  $("consultaResumo").innerHTML = itens.map(([campo, valor]) =>
    `<button class="seg${campo === "mun" && !sel.mun ? " seg-vazio" : ""}" type="button" data-abrir="${campo === "recorte" ? "sexo" : campo}" aria-haspopup="dialog" aria-expanded="false" title="Alterar ${h(ROTULO_CAMPO[campo].toLowerCase())}">
      <span class="seg-rot">${h(ROTULO_CAMPO[campo])}</span><span class="seg-val">${h(valor)}</span></button>`).join("") +
    `<button class="seg seg-editar" type="button" data-abrir="${campos[0]}" aria-haspopup="dialog" aria-expanded="false">Alterar</button>`;

  // Alternância entre análise e mapa (mesma consulta, duas formas de ver)
  const sw = $("visaoSwitch");
  sw.hidden = rota.grupo !== "explorar";
  if(!sw.hidden){
    const noMapa = sel.rota === "mapa";
    sw.innerHTML = `<a href="${h(linkPara({ rota:"municipio" }))}"${noMapa ? "" : ' aria-current="true"'}>Análise</a><a href="${h(linkPara({ rota:"mapa" }))}"${noMapa ? ' aria-current="true"' : ""}>Mapa</a>`;
  }

  // Campos do painel: só os que valem para esta área
  document.querySelectorAll("#consultaPainel [data-campo]").forEach(div => { div.hidden = !campos.includes(div.dataset.campo); });
  if(document.activeElement !== $("munInput")) $("munInput").value = sel.mun ? nomeLocal(sel.mun) : "";
  if(document.activeElement !== $("causaInput")) $("causaInput").value = sel.evento === "dengue" ? "Dengue (notificações)" : (causa.tipo === "todas" ? "" : causa.rotulo);
  $("causaInput").disabled = sel.evento === "dengue";
  $("eventoSel").value = sel.evento;
  $("anoSel").innerHTML = anosDe(sel.evento).map(a => {
    const i = infoAno(sel.evento, a);
    return `<option value="${a}"${a === sel.ano ? " selected" : ""}>${a}${i.ano_completo ? "" : ` — parcial (${h(i.periodo.split(" (")[0])})`}</option>`;
  }).join("");
  $("sexoSel").value = sel.sexo;
  $("idadeSel").value = sel.idade;
  $("eventoExplica").textContent = EVENTOS[sel.evento].explica;
}

let _segOrigem = null;
function abrirConsulta(campo){
  const painel = $("consultaPainel");
  painel.hidden = false;
  document.body.classList.add("consulta-aberta");
  document.querySelectorAll("#consultaResumo .seg").forEach(b => b.setAttribute("aria-expanded", "true"));
  const alvo = { mun:"munInput", causa:"causaInput", evento:"eventoSel", ano:"anoSel", sexo:"sexoSel", idade:"idadeSel" }[campo];
  const el = $(alvo);
  if(el && !el.disabled && !el.closest("[hidden]")) el.focus();
  else painel.querySelector("input:not([disabled]), select")?.focus();
}

function fecharConsulta(devolverFoco = true){
  const painel = $("consultaPainel");
  if(painel.hidden) return;
  painel.hidden = true;
  document.body.classList.remove("consulta-aberta");
  document.querySelectorAll("#consultaResumo .seg").forEach(b => b.setAttribute("aria-expanded", "false"));
  if(devolverFoco) (document.querySelector(`#consultaResumo [data-abrir="${_segOrigem}"]`) || document.querySelector("#consultaResumo .seg"))?.focus();
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
    else if(e.key === "Escape"){ if(!lista.hidden){ e.preventDefault(); e.stopPropagation(); fechar(); input.value = valorInicial; } }
  });
  input.addEventListener("blur", () => setTimeout(fechar, 150));
  lista.addEventListener("mousedown", e => {
    const li = e.target.closest("li[data-i]");
    if(li){ e.preventDefault(); escolher(Number(li.dataset.i)); }
  });
  return { atualizar: abrir };
}

async function copiarLink(botao){
  const original = botao.textContent;
  try{
    await navigator.clipboard.writeText(location.href);
    botao.textContent = "Link copiado";
  }catch{
    prompt("Copie o endereço desta consulta:", location.href);
  }
  setTimeout(() => { botao.textContent = original; }, 2500);
}

function ligarEventos(){
  criarCombobox($("munInput"), $("munLista"), opcoesMunicipio, item => { fecharConsulta(false); navegar({ mun:item.valor }); });
  criarCombobox($("causaInput"), $("causaLista"), opcoesCausa, item => { fecharConsulta(false); navegar({ causa:item.valor }); });
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
  $("limparBtn").addEventListener("click", () => { fecharConsulta(false); navegar({ mun: sel.rota === "municipio" || sel.rota === "fatores" ? sel.mun : "", causa:"todas", evento:"obitos", ano: anoPadrao("obitos"), sexo:"", idade:"" }); });
  $("linkBtn").addEventListener("click", e => copiarLink(e.currentTarget));

  $("consultaResumo").addEventListener("click", e => {
    const botao = e.target.closest("[data-abrir]");
    if(!botao) return;
    if(!$("consultaPainel").hidden && _segOrigem === botao.dataset.abrir){ fecharConsulta(); return; }
    _segOrigem = botao.dataset.abrir;
    abrirConsulta(botao.dataset.abrir);
  });
  $("consultaFechar").addEventListener("click", () => fecharConsulta());
  $("consultaOk").addEventListener("click", () => fecharConsulta());
  document.addEventListener("keydown", e => { if(e.key === "Escape") fecharConsulta(); });
  document.addEventListener("mousedown", e => {
    if(!$("consultaPainel").hidden && !e.target.closest("#consulta")) fecharConsulta(false);
  });

  $("mapFocusSel").addEventListener("change", e => setMapView(e.target.value));
  $("mapTabelaBtn").addEventListener("click", () => alternarTabelaMapa());
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
  const at = base.atualizacao;
  $("atualizacao").innerHTML = `<span class="sr-only">Última atualização dos dados: </span><span aria-hidden="true">Dados de </span>${h(formatarData(at.gerado_em))} <span class="atualizacao-freq">· atualização ${h(at.frequencia)}</span> <a class="atualizacao-link" href="#/fontes">como atualizamos</a>`;
  $("atualizacao").hidden = false;
  ligarEventos();
  renderizar();
}

iniciar();

/* ============================================================
   Mapa: estados em zoom baixo, municípios ao aproximar
   ------------------------------------------------------------
   Camadas (de baixo para cima), cada uma em seu próprio pane:
     estados-fill   preenchimento dos estados (interativo no nível "estados")
     municipios     municípios, carregados por UF sob demanda (nível "municípios")
     estados-borda  contorno dos estados, sempre visível e não interativo
     rotulos        siglas das UFs
   O mapa só é criado quando a área "Explorar o mapa" é aberta pela primeira vez.

   Métrica: taxa do local ÷ taxa do Brasil, mesma causa, evento e período.
   A escala é fixa (MAP_CLASSES), então a cor significa a mesma coisa em
   qualquer zoom e em qualquer estado.
   ============================================================ */
let map = null;
let mapPopup, mapTooltip, stateRenderer, municipalityRenderer, borderRenderer, mapLevelControl;

const mapa = {
  stateFillLayer: null, stateBorderLayer: null, stateLabelLayer: null,
  stateBounds: new Map(), brazilBounds: null,
  municipalityGroup: null, municipalityLayers: new Map(), municipalityLoads: new Map(),
  focoUF: "", detail: false, levelToken: 0, dadosToken: 0,
  consulta: null,            // {causa, evento, ano}
  taxaBR: null,
  ufs: new Map(),            // UF → {n, pop, taxa}
  municipios: new Map(),     // código → {n, pop, taxa, nome, uf}
  ufsComDados: new Set(),
  erro: ""
};

function criarMapa(){
  if(map) return;
  map = L.map("map", {
    zoomControl: true, preferCanvas: true, inertia: true,
    wheelDebounceTime: 25, wheelPxPerZoomLevel: 90, zoomSnap: 0.5, zoomDelta: 0.5, minZoom: 3
  }).setView([-14.5, -52.5], 4);

  [["estadosFill", 400], ["municipios", 410], ["estadosBorda", 420], ["rotulos", 430]].forEach(([name, zIndex]) => {
    map.createPane(name).style.zIndex = zIndex;
  });
  stateRenderer = L.canvas({ pane:"estadosFill", padding:0.3, tolerance:2 });
  municipalityRenderer = L.canvas({ pane:"municipios", padding:0.3, tolerance:3 });
  borderRenderer = L.canvas({ pane:"estadosBorda", padding:0.3 });
  /* Os renderers entram no mapa já na abertura. Se o primeiro deles fosse criado
     no meio de uma animação de zoom, o canvas ficaria com a área desatualizada. */
  [stateRenderer, municipalityRenderer, borderRenderer].forEach(renderer => map.addLayer(renderer));

  if("ResizeObserver" in window){
    let resizeFrame = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => map.invalidateSize({ debounceMoveend:true }));
    }).observe(map.getContainer());
  }

  mapPopup = L.popup({ maxWidth: 330 });
  mapTooltip = L.tooltip({ className:"map-tooltip", direction:"top", offset:[0, -12], opacity:1, interactive:false });
  map.attributionControl.addAttribution('Limites: <a href="https://github.com/tbrugz/geodata-br">geodata-br</a>');

  const MapHomeControl = L.Control.extend({
    options: { position:"topleft" },
    onAdd(){
      const container = L.DomUtil.create("div", "leaflet-control");
      const button = L.DomUtil.create("button", "map-home-button", container);
      button.type = "button";
      button.title = "Voltar ao foco escolhido";
      button.setAttribute("aria-label", button.title);
      button.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>`;
      L.DomEvent.disableClickPropagation(button);
      L.DomEvent.on(button, "click", () => setMapView($("mapFocusSel").value));
      return container;
    }
  });
  new MapHomeControl().addTo(map);

  const MapLevelControl = L.Control.extend({
    options: { position:"bottomleft" },
    onAdd(){
      const element = L.DomUtil.create("div", "leaflet-control map-level");
      element.setAttribute("role", "status");
      element.setAttribute("aria-live", "polite");
      return element;
    }
  });
  mapLevelControl = new MapLevelControl().addTo(map);

  $("map").addEventListener("click", event => {
    const zoom = event.target.closest(".popup-zoom");
    if(zoom) setMapView(zoom.dataset.uf);
    const abrir = event.target.closest(".popup-abrir");
    if(abrir) navegar({ rota:"municipio", mun: abrir.dataset.mun });
  });
}

/* Redesenha o canvas dos municípios inteiro. O Canvas do Leaflet ignora
   atualizações durante animações de zoom. */
function redrawMunicipalities(){
  if(map._animatingZoom){
    map.once("zoomend", redrawMunicipalities);
    return;
  }
  municipalityRenderer._update();
}

function setMapLevelHint(text){
  mapLevelControl.getContainer().textContent = text;
}

/* ---------- Identificação das feições ---------- */
const codigoDe = feature => String(feature?.properties?.id || "");
const ufDaFeicao = feature => feature?.properties?.uf || UF_BY_IBGE_PREFIX[codigoDe(feature).slice(0, 2)] || "";
const foraDoFoco = uf => Boolean(mapa.focoUF) && uf !== mapa.focoUF;

/* ---------- Valor e cor ---------- */
function medidaMapa(item){
  if(!item || item.pop == null) return { estado:"sem_dado" };
  if(mapa.taxaBR == null || !mapa.taxaBR) return { estado:"sem_dado" };
  const esperado = mapa.taxaBR / POR * item.pop;
  if(item.n < MIN_EVENTOS_MAPA && esperado < MIN_EVENTOS_MAPA) return { estado:"instavel", esperado };
  const razao = item.taxa / mapa.taxaBR;
  const classe = MAP_CLASSES.findIndex(c => razao < c.max);
  return { estado:"ok", razao, classe: classe < 0 ? MAP_CLASSES.length - 1 : classe, esperado };
}

function corDe(item){
  const medida = medidaMapa(item);
  if(medida.estado === "sem_dado") return MAP_COLORS.empty;
  if(medida.estado === "instavel") return MAP_COLORS.unstable;
  return MAP_CLASSES[medida.classe].cor;
}

function styleState(feature){
  const uf = ufDaFeicao(feature);
  return { stroke:false, fill: !foraDoFoco(uf), fillColor: corDe(mapa.ufs.get(uf)), fillOpacity:1 };
}

function styleStateBorder(feature){
  return { fill:false, color:MAP_COLORS.stateBorder, weight: mapa.detail ? 1.6 : 1, opacity: foraDoFoco(ufDaFeicao(feature)) ? 0 : 0.9 };
}

function styleMuni(feature){
  const codigo = codigoDe(feature);
  const selecionado = codigo === sel.mun;
  return {
    color: selecionado ? MAP_COLORS.highlight : MAP_COLORS.municipalityBorder,
    weight: selecionado ? 2.4 : 0.5, opacity:1,
    fillColor: mapa.ufsComDados.has(ufDaFeicao(feature)) ? corDe(mapa.municipios.get(codigo)) : MAP_COLORS.empty,
    fillOpacity:1
  };
}

function highlight(layer){
  layer.setStyle({ stroke:true, color:MAP_COLORS.highlight, weight:2.4, opacity:1 });
  layer.bringToFront();
}

/* ---------- Textos (tooltip, popup e tabela usam a mesma descrição) ---------- */
function descreverMedida(item){
  const ev = EVENTOS[mapa.consulta.evento];
  if(!item || item.pop == null) return { curto:"Sem dado de população ou de eventos", linhas:[] };
  const medida = medidaMapa(item);
  const linhas = [
    `${fmtNum.format(item.n)} ${plural(item.n, ev.singular, ev.plural)} ÷ ${fmtNum.format(item.pop)} habitantes`,
    `Taxa: ${fmtValor(item.taxa)} por 100 mil hab.`,
    `Brasil: ${fmtValor(mapa.taxaBR)} por 100 mil hab.`
  ];
  if(medida.estado === "instavel"){
    return { curto:`${fmtNum.format(item.n)} ${plural(item.n, ev.singular, ev.plural)} · poucos eventos para comparar a taxa`, linhas, nota:`Menos de ${MIN_EVENTOS_MAPA} eventos observados e esperados: a taxa muda muito com um único registro.` };
  }
  if(medida.estado === "sem_dado") return { curto:"Sem base para calcular a taxa", linhas };
  return { curto:`${fmtValor(item.taxa)} por 100 mil · ${MAP_CLASSES[medida.classe].rotulo}`, linhas, classe: MAP_CLASSES[medida.classe].rotulo };
}

function popupHtml(titulo, item, extra){
  const d = descreverMedida(item);
  return `<div class="popup-title">${h(titulo)}</div>
    ${d.classe ? `<div class="popup-total"><b>${h(d.classe)}</b></div>` : `<div class="popup-total">${h(d.curto)}</div>`}
    <ul class="popup-causes">${d.linhas.map(l => `<li>${h(l)}</li>`).join("")}</ul>
    ${d.nota ? `<div class="popup-note">${h(d.nota)}</div>` : ""}${extra}`;
}

function showTooltip(latlng, name, item){
  mapTooltip.setContent(`<strong>${h(name)}</strong><small>${h(descreverMedida(item).curto)}</small>`).setLatLng(latlng).openOn(map);
}

function onStateEvents(_feature, layer){
  layer.on({
    mouseover: event => {
      const uf = ufDaFeicao(event.target.feature);
      if(foraDoFoco(uf)) return;
      highlight(event.target);
      showTooltip(event.latlng, UF_NAMES[uf], mapa.ufs.get(uf));
    },
    mousemove: event => mapTooltip.setLatLng(event.latlng),
    mouseout: event => { event.target.setStyle(styleState(event.target.feature)); map.closeTooltip(mapTooltip); },
    click: event => {
      const uf = ufDaFeicao(event.target.feature);
      if(foraDoFoco(uf)) return;
      map.closeTooltip(mapTooltip);
      mapPopup.setLatLng(event.latlng)
        .setContent(popupHtml(`${UF_NAMES[uf]} (${uf})`, mapa.ufs.get(uf), `<button type="button" class="popup-zoom" data-uf="${uf}">Ver municípios</button>`))
        .openOn(map);
    }
  });
}

function onMunicipalityEvents(_feature, layer){
  layer.on({
    mouseover: event => {
      const feature = event.target.feature;
      highlight(event.target);
      showTooltip(event.latlng, nomeLocal(codigoDe(feature)), mapa.municipios.get(codigoDe(feature)));
    },
    mousemove: event => mapTooltip.setLatLng(event.latlng),
    mouseout: event => { event.target.setStyle(styleMuni(event.target.feature)); map.closeTooltip(mapTooltip); },
    click: event => {
      const codigo = codigoDe(event.target.feature);
      map.closeTooltip(mapTooltip);
      mapPopup.setLatLng(event.latlng)
        .setContent(popupHtml(nomeLocal(codigo), mapa.municipios.get(codigo), `<button type="button" class="popup-abrir" data-mun="${h(codigo)}">Abrir análise do município</button>`))
        .openOn(map);
    }
  });
}

/* ---------- Carregamento das geometrias ---------- */
async function carregarMapa(){
  if(mapa.stateFillLayer) return;
  criarMapa();
  try{
    const geo = await fetchJSON(PATHS.estados);
    mapa.stateFillLayer = L.geoJSON(geo, { renderer: stateRenderer, style: styleState, onEachFeature: onStateEvents }).addTo(map);
    mapa.stateBorderLayer = L.geoJSON(geo, { renderer: borderRenderer, style: styleStateBorder, interactive:false }).addTo(map);
    mapa.stateLabelLayer = L.layerGroup(geo.features.map(feature => Object.assign(L.marker(feature.properties.label, {
      pane:"rotulos", interactive:false, keyboard:false,
      icon: L.divIcon({ className:"state-label", html:`<span>${feature.properties.uf}</span>`, iconSize:null })
    }), { _uf: feature.properties.uf }))).addTo(map);
    mapa.stateFillLayer.eachLayer(layer => mapa.stateBounds.set(ufDaFeicao(layer.feature), layer.getBounds()));
    mapa.brazilBounds = mapa.stateFillLayer.getBounds();
    mapa.municipalityGroup = L.layerGroup().addTo(map);
    map.fitBounds(mapa.brazilBounds, { padding:[16,16] });
    map.on("moveend", updateMapLevel);
  }catch(err){
    console.error(err);
    mapa.erro = "O mapa não carregou. Verifique sua conexão e recarregue a página. As tabelas abaixo continuam disponíveis.";
  }
}

function loadMunicipalityLayer(uf){
  let pending = mapa.municipalityLoads.get(uf);
  if(pending) return pending;
  pending = fetchJSON(PATHS.municipiosGeo(uf)).then(geo => {
    const layer = L.geoJSON(geo, { renderer: municipalityRenderer, style: styleMuni, onEachFeature: onMunicipalityEvents });
    mapa.municipalityLayers.set(uf, layer);
    return layer;
  });
  mapa.municipalityLoads.set(uf, pending);
  pending.catch(() => mapa.municipalityLoads.delete(uf));
  return pending;
}

/* ---------- Dados do mapa ---------- */
/* Recalcula as taxas das UFs para a seleção atual. Uma resposta antiga nunca
   sobrescreve uma seleção mais nova (dadosToken). */
async function atualizarDadosMapa(consulta){
  const token = ++mapa.dadosToken;
  mapa.consulta = consulta;
  mapa.ufs = new Map();
  mapa.municipios = new Map();
  mapa.ufsComDados = new Set();
  mapa.taxaBR = null;
  const { causa, evento, ano } = consulta;
  const medir = async local => {
    const n = await contarEventos(local, causa, evento, ano);
    const populacao = popDe(local, ano)?.valor ?? null;
    return { n, pop: populacao, taxa: taxa(n, populacao) };
  };
  const [br, ...ufs] = await Promise.all(["BR", ...ALL_UFS].map(medir));
  if(token !== mapa.dadosToken) return false;
  mapa.taxaBR = br.taxa;
  mapa.brasil = br;
  ALL_UFS.forEach((uf, i) => mapa.ufs.set(uf, ufs[i]));
  restyleMap();
  if(map) updateMapLevel();
  return true;
}

async function carregarDadosMunicipais(uf){
  if(mapa.ufsComDados.has(uf) || !mapa.consulta) return;
  const token = mapa.dadosToken;
  const { causa, evento, ano } = mapa.consulta;
  const lista = await taxasDaUF(uf, causa, evento, ano);
  if(token !== mapa.dadosToken) return;
  lista.forEach(item => mapa.municipios.set(item.c, item));
  mapa.ufsComDados.add(uf);
}

/* ---------- Troca de nível conforme o zoom ---------- */
const wantsDetail = () => Boolean(mapa.focoUF) || map.getZoom() >= MUNICIPALITY_MIN_ZOOM;

function visibleUFs(){
  if(mapa.focoUF) return [mapa.focoUF];
  const view = map.getBounds();
  return [...mapa.stateBounds].filter(([, bounds]) => view.intersects(bounds)).map(([uf]) => uf);
}

function setDetail(detail){
  if(mapa.detail !== detail){
    mapa.detail = detail;
    map.getContainer().classList.toggle("map-detail", detail);
    map.closeTooltip(mapTooltip);
    mapa.stateBorderLayer?.eachLayer(layer => layer.setStyle(styleStateBorder(layer.feature)));
  }
  setMapLevelHint(detail ? "Municípios · afaste para ver os estados" : "Estados · aproxime ou clique para ver os municípios");
  document.dispatchEvent(new CustomEvent("mapa:nivel"));
}

async function updateMapLevel(){
  if(!mapa.stateFillLayer || !mapa.consulta) return;
  const token = ++mapa.levelToken;
  if(!wantsDetail()){
    setDetail(false);
    return;
  }
  const ufs = visibleUFs();
  const faltam = ufs.filter(uf => !mapa.municipalityLayers.has(uf) || !mapa.ufsComDados.has(uf));
  // Os estados continuam visíveis até os municípios da área chegarem.
  if(faltam.length) setMapLevelHint(`Carregando municípios de ${faltam.join(", ")}...`);
  try{
    await Promise.all(ufs.flatMap(uf => [loadMunicipalityLayer(uf), carregarDadosMunicipais(uf)]));
  }catch(err){
    console.error(err);
    if(token === mapa.levelToken) setMapLevelHint("Não foi possível carregar os municípios desta área. Tente aproximar novamente.");
    return;
  }
  if(token !== mapa.levelToken || !wantsDetail()) return;
  const group = mapa.municipalityGroup;
  ufs.forEach(uf => {
    const layer = mapa.municipalityLayers.get(uf);
    if(!group.hasLayer(layer)) group.addLayer(layer);
    layer.eachLayer(path => path.setStyle(styleMuni(path.feature)));
  });
  if(mapa.focoUF){
    mapa.municipalityLayers.forEach((layer, uf) => {
      if(uf !== mapa.focoUF && group.hasLayer(layer)) group.removeLayer(layer);
    });
  }
  redrawMunicipalities();
  setDetail(true);
}

/* ---------- Foco (Brasil ou um estado) ---------- */
function setMapView(uf){
  if(!mapa.stateFillLayer) return;
  map.closeTooltip(mapTooltip);
  const foco = uf && mapa.stateBounds.has(uf) ? uf : "";
  $("mapFocusSel").value = foco;
  if(foco !== mapa.focoUF){
    mapa.focoUF = foco;
    map.closePopup();
    restyleMap();
    mapa.stateLabelLayer?.eachLayer(marker => marker.getElement()?.classList.toggle("is-hidden", foraDoFoco(marker._uf)));
  }
  map.fitBounds(foco ? mapa.stateBounds.get(foco) : mapa.brazilBounds, { padding:[16,16], maxZoom: foco ? 8 : undefined });
  updateMapLevel();
  document.dispatchEvent(new CustomEvent("mapa:nivel"));
}

function restyleMap(){
  mapa.stateFillLayer?.eachLayer(layer => layer.setStyle(styleState(layer.feature)));
  mapa.stateBorderLayer?.eachLayer(layer => layer.setStyle(styleStateBorder(layer.feature)));
  mapa.municipalityLayers.forEach(group => group.eachLayer(layer => layer.setStyle(styleMuni(layer.feature))));
}

function legendaMapaHtml(){
  const item = (cor, texto) => `<span class="leg"><i style="background:${cor}"></i>${h(texto)}</span>`;
  return `<span class="leg-titulo">Taxa em relação à do Brasil</span>` +
    MAP_CLASSES.map(c => item(c.cor, c.curto)).join("") +
    item(MAP_COLORS.unstable, "poucos eventos") + item(MAP_COLORS.empty, "sem dado");
}

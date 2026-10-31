/* ============================================================
   1. Configurações e estado
   ============================================================ */
const BR_GEOJSON_URL = "municipios_brasil.geojson";
const UF_BY_IBGE_PREFIX = {
  "11":"RO","12":"AC","13":"AM","14":"RR","15":"PA","16":"AP","17":"TO",
  "21":"MA","22":"PI","23":"CE","24":"RN","25":"PB","26":"PE","27":"AL","28":"SE","29":"BA",
  "31":"MG","32":"ES","33":"RJ","35":"SP","41":"PR","42":"SC","43":"RS",
  "50":"MS","51":"MT","52":"GO","53":"DF"
};
const IBGE_PREFIX_BY_UF = Object.fromEntries(Object.entries(UF_BY_IBGE_PREFIX).map(([code, uf]) => [uf, code]));
const UF_NAMES = {
  AC:"Acre", AL:"Alagoas", AP:"Amapá", AM:"Amazonas", BA:"Bahia", CE:"Ceará", DF:"Distrito Federal",
  ES:"Espírito Santo", GO:"Goiás", MA:"Maranhão", MT:"Mato Grosso", MS:"Mato Grosso do Sul",
  MG:"Minas Gerais", PA:"Pará", PB:"Paraíba", PR:"Paraná", PE:"Pernambuco", PI:"Piauí",
  RJ:"Rio de Janeiro", RN:"Rio Grande do Norte", RS:"Rio Grande do Sul", RO:"Rondônia", RR:"Roraima",
  SC:"Santa Catarina", SP:"São Paulo", SE:"Sergipe", TO:"Tocantins"
};

const state = {
  rows: [],
  filtered: [],
  summary: null,
  filterMetadata: null,
  geoLayer: null,
  displayLayer: null,
  muniNames: new Map(),
  muniStates: new Map(),
  featuresByUF: new Map(),
  selectedUF: "",
  counts: new Map(),
  maxCount: 1,
  stateDataCache: new Map()
};

let causeChart = null;
let chapterChart = null;
let comparisonChart = null;
let dataLoaded = false;
let uploadedRowsLoaded = false;
let stateSelectionRevision = 0;
let loadedStateSelection = [];
let uploadVersion = 0;
let activeStateLoads = 0;
const queuedStateLoads = [];
const MAX_PARALLEL_STATE_LOADS = 3;

const fmtNum = new Intl.NumberFormat("pt-BR");
const ptCollator = new Intl.Collator("pt-BR");
const MUNICIPALITY_OPTION_HEIGHT = 36;
const MUNICIPALITY_OVERSCAN = 5;
let municipalityOptions = [];
let municipalityMatches = [];
let selectedMunicipality = "";
let activeMunicipalityIndex = -1;
let municipalityMenuOpen = false;

function renderStateChecklist(){
  const container = document.getElementById("stateChecks");
  const states = Object.entries(UF_NAMES)
    .sort((a,b) => a[1].localeCompare(b[1], "pt-BR"));
  container.innerHTML = states
    .map(([uf, name]) => `<label class="state-check"><input type="checkbox" value="${uf}"><span>${name}</span><small>${uf}</small></label>`)
    .join("");
  updateStatePicker();
  refreshMapFocusOptions();
}

function selectedStates(){
  return [...document.querySelectorAll("#stateChecks input:checked")].map(input => input.value);
}

function updateStatePicker(){
  const query = norm(document.getElementById("stateSearch").value);
  const selected = selectedStates();
  let visible = 0;
  let unselectedVisible = 0;
  document.querySelectorAll("#stateChecks input").forEach(input => {
    const label = input.closest(".state-check");
    const matches = !query || norm(UF_NAMES[input.value]).includes(query) || input.value.includes(query);
    label.hidden = !matches;
    label.classList.toggle("is-selected", input.checked);
    if(matches){
      visible++;
      if(!input.checked) unselectedVisible++;
    }
  });
  document.getElementById("stateSelectionCount").textContent =
    `${selected.length} selecionado${selected.length === 1 ? "" : "s"}`;
  const resultWord = query
    ? (visible === 1 ? "encontrado" : "encontrados")
    : (visible === 1 ? "disponível" : "disponíveis");
  document.getElementById("stateSearchStatus").textContent = visible
    ? `${visible} estado${visible === 1 ? "" : "s"} ${resultWord}`
    : "Nenhum estado encontrado";
  document.getElementById("selectVisibleStatesBtn").disabled = !unselectedVisible;
  document.getElementById("clearStatesBtn").disabled = !selected.length;

  const chips = document.getElementById("selectedStateChips");
  chips.hidden = !selected.length;
  chips.innerHTML = selected
    .sort((a,b) => ptCollator.compare(UF_NAMES[a], UF_NAMES[b]))
    .map(uf => `<button class="state-chip" type="button" data-uf="${uf}"
      aria-label="Remover ${escapeHtml(UF_NAMES[uf])}">${escapeHtml(UF_NAMES[uf])}<span aria-hidden="true">×</span></button>`)
    .join("");
}

function refreshMapFocusOptions(){
  map.closeTooltip(municipalityTooltip);
  const select = document.getElementById("mapFocusSel");
  const previous = select.value;
  const chosen = selectedStates();
  select.innerHTML = '<option value="">Brasil</option>' + chosen
    .sort((a,b) => ptCollator.compare(UF_NAMES[a], UF_NAMES[b]))
    .map(uf => `<option value="${uf}">${UF_NAMES[uf]} (${uf})</option>`)
    .join("");
  select.value = chosen.includes(previous) ? previous : "";
  if(state.selectedUF && !chosen.includes(state.selectedUF)) setMapView("");
  updateMapHomeLabel();
}

function updateMapHomeLabel(){
  const button = document.querySelector(".map-home-button");
  if(!button) return;
  const focus = document.getElementById("mapFocusSel").value;
  const label = `Voltar ao foco: ${UF_NAMES[focus] || "Brasil"}`;
  button.title = label;
  button.setAttribute("aria-label", label);
}

function initializeEmptyFilters(){
  ["sexSel","raceSel","schoolSel","chapterSel","categorySel"].forEach(id => {
    fillSelect(document.getElementById(id), [], "Busque os estados primeiro");
    document.getElementById(id).disabled = true;
  });
  clearMunicipalityFilter();
  document.getElementById("muniSel").disabled = true;
  document.getElementById("muniSel").placeholder = "Carregue os estados primeiro";
  document.getElementById("muniToggle").disabled = true;
  ["dateFrom","dateTo","searchInput"].forEach(id => { document.getElementById(id).disabled = true; });
}

/* ============================================================
   2. Utilidades
   ============================================================ */
function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}

function setStatus(message, phase = "loading"){
  const status = document.getElementById("status");
  if(!status) return;
  status.textContent = message;
  status.dataset.state = phase;
}

function norm(s){
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function normText(s){
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseNumberBR(v){
  if(v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function prepareRow(row){
  row._date = String(row.dt_obito || "").slice(0, 10);
  row._idade = parseNumberBR(row.nu_idade);
  row._muniNorm = norm(row.co_municipio_ibge_residencia);
  return row;
}

function searchableCause(row){
  if(row._causeText === undefined){
    row._causeText = normText([
      row.desc_cid_causa_basica,
      row.categoria_cid_causa_basica,
      row.co_cid_causa_basica
    ].join(" "));
  }
  return row._causeText;
}

function fillSelect(sel, values, placeholder){
  sel.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` +
    values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
}

function aggregate(rows, field){
  const m = new Map();
  rows.forEach(r => {
    const v = r[field] || "Não informado";
    m.set(v, (m.get(v) || 0) + 1);
  });
  return m;
}

function destroyChart(chart){
  if(chart) chart.destroy();
  return null;
}

/* ============================================================
   3. Mapa
   ============================================================ */
const map = L.map("map", {
  zoomControl: true,
  preferCanvas: true,
  inertia: true,
  inertiaDeceleration: 1800,
  inertiaMaxSpeed: 1600,
  wheelDebounceTime: 25,
  wheelPxPerZoomLevel: 90,
  zoomSnap: 0.5,
  zoomDelta: 0.5
}).setView([-14.5, -52.5], 4);
const EMPTY_MUNICIPALITY_COLOR = "#eef5f3";
const municipalityPopup = L.popup({ maxWidth: 330 });
const municipalityTooltip = L.tooltip({
  className: "municipality-tooltip",
  direction: "top",
  offset: [0, -12],
  opacity: 1,
  interactive: false
});
const municipalityRenderer = L.canvas({ padding: 0.3, tolerance: 3 });
map.attributionControl.addAttribution('Municípios: <a href="https://github.com/tbrugz/geodata-br">geodata-br</a>');

const MapHomeControl = L.Control.extend({
  options: { position:"topleft" },
  onAdd(){
    const container = L.DomUtil.create("div", "leaflet-control");
    const button = L.DomUtil.create("button", "map-home-button", container);
    button.type = "button";
    button.title = "Voltar ao foco: Brasil";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = "<span aria-hidden='true'>⌂</span>";
    L.DomEvent.disableClickPropagation(button);
    L.DomEvent.on(button, "click", () => {
      setMapView(document.getElementById("mapFocusSel").value);
    });
    return container;
  }
});
new MapHomeControl().addTo(map);

function getMuniName(feature){
  const p = feature?.properties || {};
  return p.name || p.NM_MUN || p.nome || p.NOME || "";
}

function getUF(feature){
  const code = String(feature?.properties?.id || feature?.id || "");
  return UF_BY_IBGE_PREFIX[code.slice(0,2)] || "";
}

function featureKey(feature){
  if(!feature._mapKey){
    feature._mapKey = `${getUF(feature)}|${norm(getMuniName(feature))}`;
  }
  return feature._mapKey;
}

function styleMuni(feature){
  const item = state.counts.get(featureKey(feature));
  if(!item) return {
    color:"#fff", weight:0.8,
    fillColor:EMPTY_MUNICIPALITY_COLOR,
    fillOpacity:0.96
  };
  const share = item.count / state.maxCount;
  const opacity = 0.32 + Math.sqrt(share) * 0.68;
  return {
    color: "#fff",
    weight: 0.7,
    fillColor: item.color || "#79909a",
    fillOpacity: opacity
  };
}

function popupMuni(key){
  const item = state.counts.get(key);
  const name = item?.name || state.muniNames.get(key) || key;

  if(!item){
    return `<b>${escapeHtml(name)}</b><br><span>Sem óbitos no filtro atual.</span>`;
  }

  const top = [...item.causes.entries()]
    .sort((a,b) => b[1] - a[1])
    .slice(0, 6)
    .map(([c,n]) => `${escapeHtml(c)}: <b>${n}</b>`)
    .join("<br>");

  return `
    <b>${escapeHtml(name)}</b><br>
    Óbitos: <b>${item.count}</b><br>
    Causa mais frequente: <b>${escapeHtml(item.topCause || "Não informado")}</b><br>
    <small>Principais causas:<br>${top || "Não informado"}</small>
  `;
}

function onMunicipalityClick(event){
  map.closeTooltip(municipalityTooltip);
  municipalityPopup
    .setLatLng(event.latlng)
    .setContent(popupMuni(featureKey(event.target.feature)))
    .openOn(map);
}

function onMunicipalityHover(event){
  if(!selectedStates().includes(getUF(event.target.feature))) return;
  const name = getMuniName(event.target.feature) || "Município";
  municipalityTooltip
    .setContent(`<strong>${escapeHtml(name)}</strong><small>Clique para mais detalhes</small>`)
    .setLatLng(event.target.getCenter())
    .openOn(map);
}

function createMunicipalityLayer(features){
  return L.geoJSON(features, {
    renderer: municipalityRenderer,
    style: styleMuni,
    onEachFeature: (_feature, layer) => layer.on({
      click: onMunicipalityClick,
      mouseover: onMunicipalityHover,
      mouseout: () => map.closeTooltip(municipalityTooltip)
    })
  });
}

async function loadBrazil(){
  try{
    const res = await fetch(BR_GEOJSON_URL);
    if(!res.ok) throw new Error("Falha ao carregar os municípios brasileiros.");
    const geo = await res.json();
    state.featuresByUF = new Map();
    geo.features.forEach(feature => {
      const uf = getUF(feature);
      if(!uf) return;
      if(!state.featuresByUF.has(uf)) state.featuresByUF.set(uf, []);
      state.featuresByUF.get(uf).push(feature);
      const name = getMuniName(feature);
      if(name){
        state.muniStates.set(norm(name), uf);
        state.muniNames.set(featureKey(feature), name);
      }
    });
    state.geoLayer = createMunicipalityLayer(geo).addTo(map);
    state.displayLayer = state.geoLayer;
    map.fitBounds(state.geoLayer.getBounds(), { padding: [16,16] });
    if(dataLoaded){
      state.filterMetadata = buildFilterMetadata(state.rows);
      updateComparisonOptions();
      applyFilters();
    }else updateMap();
    if(document.getElementById("mapFocusSel").value) setMapView(document.getElementById("mapFocusSel").value);
  }catch(err){
    console.error(err);
    setStatus("O mapa não carregou. Verifique os arquivos GeoJSON e recarregue a página.", "error");
  }
}

function setMapView(uf){
  if(!state.geoLayer) return;
  map.closeTooltip(municipalityTooltip);
  const selectedUF = uf && selectedStates().includes(uf) && state.featuresByUF.has(uf) ? uf : "";
  document.getElementById("mapFocusSel").value = selectedUF;
  updateMapHomeLabel();
  if(selectedUF === state.selectedUF){
    map.fitBounds(state.displayLayer.getBounds(), {
      padding:[16,16], maxZoom:selectedUF ? 8 : undefined
    });
    return;
  }

  if(state.displayLayer) map.removeLayer(state.displayLayer);
  state.selectedUF = selectedUF;
  if(selectedUF){
    const features = state.featuresByUF.get(selectedUF);
    state.displayLayer = createMunicipalityLayer(features).addTo(map);
  }else{
    state.displayLayer = state.geoLayer.addTo(map);
  }
  map.fitBounds(state.displayLayer.getBounds(), {
    padding:[16,16], maxZoom:selectedUF ? 8 : undefined
  });
  updateMap();
}

function updateMap(){
  if(!state.displayLayer) return;
  const counts = state.summary?.mapCounts || new Map();
  const globalCauses = state.summary?.causeCounts || new Map();
  const palette = ["#087f8c", "#d95d39", "#6a67ce", "#bf7b13", "#25855a", "#c04476", "#55738c", "#8d6b48"];
  const rankedCauses = [...globalCauses.entries()].sort((a,b) => b[1] - a[1]);
  const causeColors = new Map(rankedCauses.slice(0, palette.length).map(([cause], i) => [cause, palette[i]]));
  const otherColor = "#82949a";
  counts.forEach(item => {
    const top = [...item.causes.entries()].sort((a,b) => b[1] - a[1])[0];
    item.topCause = top?.[0] || "Não informado";
    item.color = causeColors.get(item.topCause) || otherColor;
  });
  state.counts = counts;
  state.maxCount = 1;
  counts.forEach(item => { if(item.count > state.maxCount) state.maxCount = item.count; });
  renderMapLegend(rankedCauses, palette, otherColor);

  state.displayLayer.eachLayer(layer => {
    if(layer.feature) layer.setStyle(styleMuni(layer.feature));
  });
}

function renderMapLegend(rankedCauses, palette, otherColor){
  const legend = document.getElementById("mapLegend");
  const entries = ['<div class="legend-explainer">Cor = doença mais frequente · cor mais forte = mais registros</div>'];
  entries.push(...rankedCauses.slice(0, palette.length).map(([cause], i) =>
    `<span class="legend-item"><i class="legend-swatch" style="background:${palette[i]}"></i>${escapeHtml(cause)}</span>`
  ));
  if(rankedCauses.length > palette.length) entries.push(`<span class="legend-item"><i class="legend-swatch" style="background:${otherColor}"></i>Outras doenças</span>`);
  entries.push(`<span class="legend-item"><i class="legend-swatch" style="background:${EMPTY_MUNICIPALITY_COLOR}"></i>Sem registros</span>`);
  entries.push('<div class="legend-intensity"><strong>Intensidade dos registros</strong><div class="intensity-ramp"><span>Menos</span><i aria-hidden="true"></i><span>Mais</span></div></div>');
  legend.innerHTML = entries.join("");
}

/* ============================================================
   4. Carregamento e filtros do CSV
   ============================================================ */
function buildFilterMetadata(rows){
  const sex = new Set();
  const race = new Set();
  const school = new Set();
  const chapters = new Set();
  const categories = new Set();
  const categoriesByChapter = new Map();
  const municipalities = new Set();
  const availableUFs = new Set();
  let minDate = "";
  let maxDate = "";

  for(const row of rows){
    if(row.sg_sexo) sex.add(row.sg_sexo);
    if(row.tp_raca_cor) race.add(row.tp_raca_cor);
    if(row.tp_escolaridade) school.add(row.tp_escolaridade);
    if(row.capitulo_cid_causa_basica) chapters.add(row.capitulo_cid_causa_basica);
    if(row.categoria_cid_causa_basica){
      categories.add(row.categoria_cid_causa_basica);
      const chapter = row.capitulo_cid_causa_basica;
      if(!categoriesByChapter.has(chapter)) categoriesByChapter.set(chapter, new Set());
      categoriesByChapter.get(chapter).add(row.categoria_cid_causa_basica);
    }
    const municipality = row.co_municipio_ibge_residencia;
    if(municipality) municipalities.add(municipality);
    const uf = row.uf || state.muniStates.get(row._muniNorm);
    if(uf) availableUFs.add(uf);
    if(row._date){
      if(!minDate || row._date < minDate) minDate = row._date;
      if(!maxDate || row._date > maxDate) maxDate = row._date;
    }
  }
  const sorted = values => [...values].sort(ptCollator.compare);
  return {
    sex: sorted(sex), race: sorted(race), school: sorted(school),
    chapters: sorted(chapters), categories: sorted(categories),
    categoriesByChapter: new Map([...categoriesByChapter].map(([chapter, values]) => [chapter, sorted(values)])),
    municipalities: sorted(municipalities),
    availableUFs, minDate, maxDate
  };
}

function loadRows(rows, { preserveFilters = false } = {}){
  clearTimeout(pendingFilterTimer);
  pendingFilterTimer = null;
  const filterIds = ["sexSel","raceSel","schoolSel","chapterSel","categorySel","muniSel","dateFrom","dateTo","searchInput"];
  const previousFilters = preserveFilters
    ? Object.fromEntries(filterIds.map(id => [id, document.getElementById(id).value]))
    : null;
  const previousMunicipalitySelection = preserveFilters ? selectedMunicipality : "";
  const previousDateBounds = preserveFilters ? {
    from: document.getElementById("dateFrom").min,
    to: document.getElementById("dateTo").max
  } : null;
  if(!preserveFilters){
    document.getElementById("searchInput").value = "";
    clearMunicipalityFilter();
  }
  state.rows = rows;
  state.filterMetadata = buildFilterMetadata(rows);

  updateComparisonOptions();
  populateFilters();
  ["dateFrom","dateTo","sexSel","raceSel","schoolSel","chapterSel","categorySel","muniSel","searchInput"]
    .forEach(id => { document.getElementById(id).disabled = false; });
  setDateBounds();
  refreshCategoryOptions();
  if(previousFilters){
    for(const id of filterIds){
      const element = document.getElementById(id);
      const value = previousFilters[id];
      if(!value) continue;
      if(element.tagName === "SELECT"){
        if([...element.options].some(option => option.value === value)) element.value = value;
      }else if(element.type === "date"){
        const wasDefault = id === "dateFrom"
          ? value === previousDateBounds.from
          : value === previousDateBounds.to;
        if(!wasDefault && value >= element.min && value <= element.max) element.value = value;
      }else element.value = value;
    }
    refreshCategoryOptions();
    if(previousFilters.categorySel){
      const categorySelect = document.getElementById("categorySel");
      if([...categorySelect.options].some(option => option.value === previousFilters.categorySel)){
        categorySelect.value = previousFilters.categorySel;
      }
    }
    if(previousMunicipalitySelection && municipalityOptions.some(item => item.name === previousMunicipalitySelection)){
      selectedMunicipality = previousMunicipalitySelection;
    }
  }
  applyFilters();

  setStatus(`Base pronta · ${fmtNum.format(state.rows.length)} registros`, "success");
  dataLoaded = true;
}

function clearStateResults(){
  loadedStateSelection = [];
  ["dateFrom","dateTo"].forEach(id => {
    const input = document.getElementById(id);
    input.value = "";
    input.min = "";
    input.max = "";
  });
  loadRows([]);
  dataLoaded = false;
  initializeEmptyFilters();
  document.getElementById("selectedStatesLabel").textContent = "Nenhum estado selecionado · marque estados para carregar seus dados";
  setStatus("Dados removidos do mapa · marque um estado para carregar novamente.", "success");
}

function parseCSVSource(source, { cancelled = () => false, onProgress = () => {} } = {}){
  const rows = [];
  let parsed = 0;
  let hasBomHeader;
  return new Promise((resolve, reject) => Papa.parse(source, {
    worker: true,
    chunkSize: 4 * 1024 * 1024,
    delimiter: ";",
    header: true,
    skipEmptyLines: "greedy",
    chunk: (res, parser) => {
      if(cancelled()){
        parser.abort();
        reject(new Error("Leitura substituída."));
        return;
      }
      if(hasBomHeader === undefined){
        hasBomHeader = (Object.keys(res.data[0] || {})[0] || "").startsWith("\uFEFF");
      }
      for(const row of res.data){
        let parsedRow = row;
        if(hasBomHeader){
          parsedRow = {};
          Object.keys(row).forEach(key => { parsedRow[key.replace(/^\uFEFF/, "").trim()] = row[key]; });
        }
        if(parsedRow.dt_obito || parsedRow.co_cid_causa_basica || parsedRow.categoria_cid_causa_basica){
          rows.push(prepareRow(parsedRow));
        }
      }
      parsed += res.data.length;
      onProgress(parsed);
    },
    complete: () => {
      if(cancelled()){
        reject(new Error("Leitura substituída."));
        return;
      }
      if(!rows.length){
        reject(new Error("O CSV não contém registros compatíveis."));
        return;
      }
      resolve(rows);
    },
    error: (err) => {
      reject(err);
    }
  }));
}

function getStateRows(uf){
  let pending = state.stateDataCache.get(uf);
  if(pending) return pending;
  pending = new Promise((resolve, reject) => {
    const start = async () => {
      activeStateLoads++;
      try{
        if(!selectedStates().includes(uf) || uploadedRowsLoaded) throw new Error("Seleção alterada.");
        const prefix = IBGE_PREFIX_BY_UF[uf];
        const response = await fetch(`dados_estados/2026/${prefix}.csv`, { cache:"force-cache" });
        if(!response.ok) throw new Error(`Arquivo do estado ${uf} indisponível (HTTP ${response.status}).`);
        resolve(await parseCSVSource(await response.blob(), {
          cancelled: () => uploadedRowsLoaded || !selectedStates().includes(uf)
        }));
      }catch(err){
        reject(err);
      }finally{
        activeStateLoads--;
        queuedStateLoads.shift()?.();
      }
    };
    if(activeStateLoads < MAX_PARALLEL_STATE_LOADS) start();
    else queuedStateLoads.push(start);
  });
  state.stateDataCache.set(uf, pending);
  pending.catch(() => {
    if(state.stateDataCache.get(uf) === pending) state.stateDataCache.delete(uf);
  });
  return pending;
}

async function loadSelectedStateData(ufs, revision = stateSelectionRevision){
  if(!ufs.length){
    setStatus("Marque pelo menos um estado para carregar somente os dados selecionados.", "error");
    return;
  }

  let completed = 0;
  setStatus(`Carregando ${ufs.length} estado${ufs.length === 1 ? "" : "s"}...`);
  try{
    const lists = await Promise.all(ufs.map(async uf => {
      const rows = await getStateRows(uf);
      completed++;
      if(revision === stateSelectionRevision){
        setStatus(`Organizando estados · ${completed} de ${ufs.length} carregados`);
      }
      return rows;
    }));
    if(revision !== stateSelectionRevision || uploadedRowsLoaded) return;
    const combined = lists.flat();
    loadedStateSelection = [...ufs];
    loadRows(combined, { preserveFilters: dataLoaded });
    document.getElementById("selectedStatesLabel").textContent = `${ufs.length} estado${ufs.length === 1 ? "" : "s"} exibido${ufs.length === 1 ? "" : "s"} · mapa do Brasil inteiro`;
    setStatus(`Dados prontos · ${ufs.length} estado${ufs.length === 1 ? "" : "s"} · ${fmtNum.format(combined.length)} registros`, "success");
  }catch(err){
    if(revision === stateSelectionRevision){
      console.error(err);
      setStatus(`Não foi possível carregar os estados selecionados: ${err.message}`, "error");
    }
  }
}

function populateFilters(){
  const metadata = state.filterMetadata;
  fillSelect(document.getElementById("sexSel"), metadata.sex, "Todos");
  fillSelect(document.getElementById("raceSel"), metadata.race, "Todas");
  fillSelect(document.getElementById("schoolSel"), metadata.school, "Todas");
  fillSelect(document.getElementById("chapterSel"), metadata.chapters, "Todos");
  populateMunicipalityOptions();
}

function updateComparisonOptions(){
  const availableUFs = state.filterMetadata.availableUFs;
  const chosen = selectedStates();
  const options = chosen.filter(uf => availableUFs.has(uf));
  ["compareStateA","compareStateB"].forEach((id, index) => {
    const select = document.getElementById(id);
    const current = select.value;
    select.innerHTML = options.map(uf => `<option value="${uf}">${UF_NAMES[uf]} (${uf})</option>`).join("")
      || '<option value="">Carregue dois estados</option>';
    select.disabled = options.length < 2;
    if(options.includes(current)) select.value = current;
    else if(options.length >= 2) select.value = options[index === 0 ? 0 : 1];
  });
}

function renderStateComparison(){
  if(!document.getElementById("comparisonPanel").open) return;
  const ufA = document.getElementById("compareStateA").value;
  const ufB = document.getElementById("compareStateB").value;
  const empty = document.getElementById("comparisonEmpty");
  const results = document.getElementById("comparisonResults");
  if(!ufA || !ufB || ufA === ufB){
    results.hidden = true;
    empty.hidden = false;
    empty.textContent = selectedStates().length < 2
      ? "Marque pelo menos dois estados para comparar."
      : "Escolha dois estados diferentes nos seletores acima.";
    comparisonChart = destroyChart(comparisonChart);
    return;
  }

  const statsFor = uf => {
    const rows = state.filtered.filter(row => row.uf === uf);
    const causes = aggregate(rows, "categoria_cid_causa_basica");
    const leader = [...causes.entries()].sort((a,b) => b[1] - a[1])[0];
    const municipalities = new Set(rows.map(row => row.co_municipio_ibge_residencia).filter(Boolean));
    const ages = rows.map(row => row._idade).filter(age => Number.isFinite(age));
    return {
      rows, causes, leader,
      municipalities: municipalities.size,
      meanAge: ages.length ? (ages.reduce((sum, age) => sum + age, 0) / ages.length).toFixed(1).replace(".", ",") : "—"
    };
  };
  const a = statsFor(ufA);
  const b = statsFor(ufB);
  const card = (uf, stats, tint) => `
    <article class="comparison-state" style="--state-accent:${tint}">
      <h4>${UF_NAMES[uf]} <span>${uf}</span></h4>
      <dl>
        <div><dt>Óbitos</dt><dd>${fmtNum.format(stats.rows.length)}</dd></div>
        <div><dt>Municípios</dt><dd>${fmtNum.format(stats.municipalities)}</dd></div>
        <div><dt>Idade média</dt><dd>${stats.meanAge}</dd></div>
        <div class="comparison-leader"><dt>Doença líder</dt><dd>${escapeHtml(stats.leader?.[0] || "Sem registros")}</dd></div>
      </dl>
    </article>`;
  document.getElementById("comparisonCards").innerHTML = card(ufA, a, "#16877c") + card(ufB, b, "#6572c5");
  empty.hidden = true;
  results.hidden = false;

  const labels = [...new Set([...a.causes.keys(), ...b.causes.keys()])]
    .sort((x,y) => (a.causes.get(y) || 0) + (b.causes.get(y) || 0) - (a.causes.get(x) || 0) - (b.causes.get(x) || 0))
    .slice(0, 6);
  const datasets = [
      { label: `${UF_NAMES[ufA]} (${ufA})`, data: labels.map(label => a.causes.get(label) || 0), backgroundColor: "#16877c", borderRadius: 4 },
      { label: `${UF_NAMES[ufB]} (${ufB})`, data: labels.map(label => b.causes.get(label) || 0), backgroundColor: "#6572c5", borderRadius: 4 }
    ];
  if(comparisonChart){
    comparisonChart.data.labels = labels;
    comparisonChart.data.datasets = datasets;
    comparisonChart.update("none");
    return;
  }
  comparisonChart = new Chart(document.getElementById("comparisonChart"), {
    type: "bar",
    data: { labels, datasets },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function populateMunicipalityOptions(){
  municipalityOptions = state.filterMetadata.municipalities.map(name => ({ name, normalized:norm(name) }));
  municipalityMatches = municipalityOptions;
  activeMunicipalityIndex = -1;
  selectedMunicipality = "";
  closeMunicipalityMenu();
  document.getElementById("muniSel").placeholder = municipalityOptions.length
    ? "Buscar município..."
    : "Nenhum município disponível";
  document.getElementById("muniToggle").disabled = !municipalityOptions.length;
}

function closeMunicipalityMenu(){
  municipalityMenuOpen = false;
  document.getElementById("muniMenu").hidden = true;
  document.getElementById("muniSel").setAttribute("aria-expanded", "false");
  document.getElementById("muniSel").removeAttribute("aria-activedescendant");
}

function clearMunicipalityFilter(){
  document.getElementById("muniSel").value = "";
  selectedMunicipality = "";
  closeMunicipalityMenu();
}

function renderMunicipalityMatches(){
  if(!municipalityMenuOpen) return;
  const list = document.getElementById("muniOptions");
  const spacer = document.getElementById("muniSpacer");
  const count = municipalityMatches.length;
  document.getElementById("muniResults").textContent = count
    ? `${fmtNum.format(count)} município${count === 1 ? "" : "s"} · role para ver todos`
    : "Nenhum município encontrado";
  if(!count){
    spacer.style.height = "0";
    spacer.innerHTML = "";
    document.getElementById("muniSel").removeAttribute("aria-activedescendant");
    return;
  }

  const first = Math.max(0, Math.floor(list.scrollTop / MUNICIPALITY_OPTION_HEIGHT) - MUNICIPALITY_OVERSCAN);
  const visibleCount = Math.ceil(240 / MUNICIPALITY_OPTION_HEIGHT) + MUNICIPALITY_OVERSCAN * 2;
  const last = Math.min(count, first + visibleCount);
  const items = [];
  for(let index = first; index < last; index++){
    const name = municipalityMatches[index].name;
    items.push(`<div id="muni-option-${index}" class="municipality-option" role="option"
      aria-selected="${index === activeMunicipalityIndex}" aria-posinset="${index + 1}"
      aria-setsize="${count}" data-index="${index}"
      style="top:${index * MUNICIPALITY_OPTION_HEIGHT}px">${escapeHtml(name)}</div>`);
  }
  spacer.style.height = `${count * MUNICIPALITY_OPTION_HEIGHT}px`;
  spacer.innerHTML = items.join("");
  const activeVisible = activeMunicipalityIndex >= first && activeMunicipalityIndex < last;
  if(activeVisible) document.getElementById("muniSel").setAttribute("aria-activedescendant", `muni-option-${activeMunicipalityIndex}`);
  else document.getElementById("muniSel").removeAttribute("aria-activedescendant");
}

function filterMunicipalityMatches(showAll = false){
  const query = showAll ? "" : norm(document.getElementById("muniSel").value);
  municipalityMatches = query
    ? municipalityOptions.filter(item => item.normalized.includes(query))
    : municipalityOptions;
  activeMunicipalityIndex = municipalityMatches.length ? 0 : -1;
  document.getElementById("muniOptions").scrollTop = 0;
  renderMunicipalityMatches();
}

function openMunicipalityMenu(){
  if(document.getElementById("muniSel").disabled) return;
  municipalityMenuOpen = true;
  document.getElementById("muniMenu").hidden = false;
  document.getElementById("muniSel").setAttribute("aria-expanded", "true");
  filterMunicipalityMatches(Boolean(selectedMunicipality));
}

function chooseMunicipality(index){
  const item = municipalityMatches[index];
  if(!item) return;
  const input = document.getElementById("muniSel");
  input.value = item.name;
  selectedMunicipality = item.name;
  input.focus();
  closeMunicipalityMenu();
  scheduleApplyFilters();
}

function moveMunicipalitySelection(direction){
  const wasOpen = municipalityMenuOpen;
  if(!wasOpen) openMunicipalityMenu();
  if(!municipalityMatches.length) return;
  activeMunicipalityIndex = wasOpen
    ? Math.max(0, Math.min(municipalityMatches.length - 1, activeMunicipalityIndex + direction))
    : (direction > 0 ? 0 : municipalityMatches.length - 1);
  const list = document.getElementById("muniOptions");
  const top = activeMunicipalityIndex * MUNICIPALITY_OPTION_HEIGHT;
  if(top < list.scrollTop) list.scrollTop = top;
  else if(top + MUNICIPALITY_OPTION_HEIGHT > list.scrollTop + list.clientHeight){
    list.scrollTop = top + MUNICIPALITY_OPTION_HEIGHT - list.clientHeight;
  }
  renderMunicipalityMatches();
}

function setDateBounds(){
  const { minDate, maxDate } = state.filterMetadata;
  if(!minDate || !maxDate) return;

  ["dateFrom","dateTo"].forEach(id => {
    const el = document.getElementById(id);
    el.min = minDate;
    el.max = maxDate;
  });

  document.getElementById("dateFrom").value = minDate;
  document.getElementById("dateTo").value = maxDate;
}

function refreshCategoryOptions(){
  const chapter = document.getElementById("chapterSel").value;
  const metadata = state.filterMetadata;
  const cats = chapter ? metadata.categoriesByChapter.get(chapter) || [] : metadata.categories;
  fillSelect(document.getElementById("categorySel"), cats, "Todas");
}

function applyFilters(){
  const from = document.getElementById("dateFrom").value;
  const to = document.getElementById("dateTo").value;

  const sex = document.getElementById("sexSel").value;
  const race = document.getElementById("raceSel").value;
  const school = document.getElementById("schoolSel").value;
  const chapter = document.getElementById("chapterSel").value;
  const category = document.getElementById("categorySel").value;
  const municipalityQuery = norm(document.getElementById("muniSel").value);
  const effectiveUFs = new Set(selectedStates());
  const search = normText(document.getElementById("searchInput").value);

  state.filtered = state.rows.filter(r => {
    if(from && (!r._date || r._date < from)) return false;
    if(to && (!r._date || r._date > to)) return false;
    if(sex && r.sg_sexo !== sex) return false;
    if(race && r.tp_raca_cor !== race) return false;
    if(school && r.tp_escolaridade !== school) return false;
    if(chapter && r.capitulo_cid_causa_basica !== chapter) return false;
    if(category && r.categoria_cid_causa_basica !== category) return false;
    if(effectiveUFs.size){
      const rowUF = r.uf || state.muniStates.get(r._muniNorm);
      if(!effectiveUFs.has(rowUF)) return false;
    }
    if(selectedMunicipality){
      if(r.co_municipio_ibge_residencia !== selectedMunicipality) return false;
    }else if(municipalityQuery && !r._muniNorm.includes(municipalityQuery)) return false;
    if(search && !searchableCause(r).includes(search)) return false;
    return true;
  });

  state.summary = summarizeFilteredRows(state.filtered);
  updateKPIs();
  updateMap();
  updateCharts();
  updateTables();
  renderStateComparison();
}

let pendingFilterTimer;
function scheduleApplyFilters(delay = 0){
  clearTimeout(pendingFilterTimer);
  pendingFilterTimer = setTimeout(() => {
    pendingFilterTimer = null;
    if(dataLoaded) applyFilters();
  }, delay);
}

function summarizeFilteredRows(rows){
  const mapCounts = new Map();
  const causeCounts = new Map();
  const chapterCounts = new Map();
  const municipalityNames = new Set();
  const categories = new Set();
  let ageSum = 0;
  let ageCount = 0;

  for(const row of rows){
    const category = row.categoria_cid_causa_basica;
    const cause = category || "Não informado";
    const chapter = row.capitulo_cid_causa_basica || "Não informado";
    causeCounts.set(cause, (causeCounts.get(cause) || 0) + 1);
    chapterCounts.set(chapter, (chapterCounts.get(chapter) || 0) + 1);
    if(category) categories.add(category);
    if(row.co_municipio_ibge_residencia) municipalityNames.add(row.co_municipio_ibge_residencia);
    if(Number.isFinite(row._idade)){
      ageSum += row._idade;
      ageCount++;
    }

    if(!row._muniNorm) continue;
    const uf = row.uf || state.muniStates.get(row._muniNorm) || "";
    const key = `${uf}|${row._muniNorm}`;
    let item = mapCounts.get(key);
    if(!item){
      item = {
        name: row.co_municipio_ibge_residencia || key,
        count: 0,
        causes: new Map(),
        topCause: "",
        color: ""
      };
      mapCounts.set(key, item);
    }
    item.count++;
    const mapCause = category || row.desc_cid_causa_basica || "Não informado";
    item.causes.set(mapCause, (item.causes.get(mapCause) || 0) + 1);
  }
  return {
    mapCounts, causeCounts, chapterCounts,
    municipalityCount: municipalityNames.size,
    categoryCount: categories.size,
    meanAge: ageCount ? ageSum / ageCount : null
  };
}

/* ============================================================
   5. KPIs, gráficos e tabelas
   ============================================================ */
function updateKPIs(){
  document.getElementById("kpiTotal").textContent = fmtNum.format(state.filtered.length);
  document.getElementById("kpiMunis").textContent = fmtNum.format(state.summary.municipalityCount);
  document.getElementById("kpiCausas").textContent = fmtNum.format(state.summary.categoryCount);
  document.getElementById("kpiIdade").textContent = state.summary.meanAge !== null
    ? state.summary.meanAge.toFixed(1).replace(".", ",")
    : "—";
}

function updateCharts(){
  const palette = [
    "#2563eb","#16a34a","#dc2626","#f59e0b","#7c3aed",
    "#0891b2","#be123c","#4d7c0f","#c2410c","#64748b"
  ];

  const topCauses = [...state.summary.causeCounts.entries()]
    .sort((a,b) => b[1] - a[1])
    .slice(0, 10);

  const causeLabels = topCauses.map(x => x[0]);
  const causeValues = topCauses.map(x => x[1]);
  if(causeChart){
    causeChart.data.labels = causeLabels;
    causeChart.data.datasets[0].data = causeValues;
    causeChart.update("none");
  }else causeChart = new Chart(document.getElementById("causeChart"), {
    type: "bar",
    data: {
      labels: causeLabels,
      datasets: [{
        label: "Óbitos",
        data: causeValues,
        backgroundColor: "#2563eb",
        borderRadius: 5
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });

  const chapters = [...state.summary.chapterCounts.entries()].sort((a,b) => b[1] - a[1]);

  const chapterLabels = chapters.map(x => x[0]);
  const chapterValues = chapters.map(x => x[1]);
  if(chapterChart){
    chapterChart.data.labels = chapterLabels;
    chapterChart.data.datasets[0].data = chapterValues;
    chapterChart.data.datasets[0].backgroundColor = chapters.map((_, i) => palette[i % palette.length]);
    chapterChart.update("none");
  }else chapterChart = new Chart(document.getElementById("chapterChart"), {
    type: "doughnut",
    data: {
      labels: chapterLabels,
      datasets: [{
        data: chapterValues,
        backgroundColor: chapters.map((_, i) => palette[i % palette.length]),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 } } }
      }
    }
  });
}

function updateTables(){
  const topMunis = [...state.summary.mapCounts.values()]
    .sort((a,b) => b.count - a.count)
    .slice(0, 15);

  document.getElementById("muniTbody").innerHTML = topMunis.map(item => {
    return `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td><span class="badge">${fmtNum.format(item.count)}</span></td>
        <td>${escapeHtml(item.topCause || "—")}</td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="3" class="muted">Sem dados para os filtros selecionados.</td></tr>`;

  document.getElementById("topMuniCount").textContent =
    `${topMunis.length} municípios exibidos`;

  const shown = state.filtered.slice(0, 100);
  document.getElementById("detailTbody").innerHTML = shown.map(r => `
    <tr>
      <td>${escapeHtml(r.dt_obito)}</td>
      <td>${escapeHtml(r.co_municipio_ibge_residencia)}</td>
      <td>${escapeHtml(r.sg_sexo)}</td>
      <td>${escapeHtml(r.nu_idade)}</td>
      <td>${escapeHtml(r.co_cid_causa_basica)}</td>
      <td>${escapeHtml(r.categoria_cid_causa_basica || r.desc_cid_causa_basica)}</td>
    </tr>
  `).join("") || `<tr><td colspan="6" class="muted">Sem registros para os filtros selecionados.</td></tr>`;

  document.getElementById("detailCount").textContent =
    `Mostrando ${Math.min(100, state.filtered.length)} de ${fmtNum.format(state.filtered.length)} registros`;
}

/* ============================================================
   6. Eventos
   ============================================================ */
document.getElementById("csvFile").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if(!file) return;
  const version = ++uploadVersion;
  stateSelectionRevision++;
  clearStateResults();
  uploadedRowsLoaded = true;
  setStatus(`Lendo ${file.name} · isso pode levar alguns instantes...`);
  parseCSVSource(file, {
    cancelled: () => version !== uploadVersion,
    onProgress: parsed => {
      if(version === uploadVersion) setStatus(`Lendo ${file.name} · ${fmtNum.format(parsed)} linhas`);
    }
  }).then(rows => {
    if(version !== uploadVersion) return;
    loadRows(rows);
    setStatus(`Arquivo carregado · ${fmtNum.format(state.rows.length)} registros`, "success");
    document.getElementById("selectedStatesLabel").textContent = "Arquivo selecionado · Brasil inteiro";
  }).catch(err => {
    if(version !== uploadVersion) return;
    uploadedRowsLoaded = false;
    clearStateResults();
    setStatus(`Não foi possível ler o CSV: ${err.message}`, "error");
  });
});

document.getElementById("chapterSel").addEventListener("change", () => {
  refreshCategoryOptions();
  scheduleApplyFilters();
});

["dateFrom","dateTo","sexSel","raceSel","schoolSel","categorySel"].forEach(id => {
  document.getElementById(id).addEventListener("change", () => {
    scheduleApplyFilters();
  });
});

document.getElementById("searchInput").addEventListener("input", () => {
  scheduleApplyFilters(180);
});

document.getElementById("muniSel").addEventListener("focus", openMunicipalityMenu);
document.getElementById("muniSel").addEventListener("input", () => {
  selectedMunicipality = "";
  if(!municipalityMenuOpen) openMunicipalityMenu();
  else filterMunicipalityMatches();
  scheduleApplyFilters(180);
});
document.getElementById("muniSel").addEventListener("keydown", event => {
  if(event.key === "ArrowDown" || event.key === "ArrowUp"){
    event.preventDefault();
    moveMunicipalitySelection(event.key === "ArrowDown" ? 1 : -1);
  }else if(event.key === "Enter" && municipalityMenuOpen){
    event.preventDefault();
    chooseMunicipality(activeMunicipalityIndex);
  }else if(event.key === "Escape" || event.key === "Tab") closeMunicipalityMenu();
});
document.getElementById("muniToggle").addEventListener("click", () => {
  if(municipalityMenuOpen) closeMunicipalityMenu();
  else{
    const input = document.getElementById("muniSel");
    if(document.activeElement === input) openMunicipalityMenu();
    else input.focus();
  }
});
document.getElementById("muniOptions").addEventListener("scroll", renderMunicipalityMatches);
document.getElementById("muniOptions").addEventListener("click", event => {
  const option = event.target.closest("[data-index]");
  if(option) chooseMunicipality(Number(option.dataset.index));
});
document.addEventListener("pointerdown", event => {
  if(!event.target.closest(".municipality-combobox")) closeMunicipalityMenu();
});

["compareStateA","compareStateB"].forEach(id => {
  document.getElementById(id).addEventListener("change", renderStateComparison);
});
document.getElementById("comparisonPanel").addEventListener("toggle", () => {
  if(document.getElementById("comparisonPanel").open){
    renderStateComparison();
    requestAnimationFrame(() => comparisonChart?.resize());
  }
});

document.getElementById("mapFocusSel").addEventListener("change", event => {
  updateMapHomeLabel();
  setMapView(event.target.value);
});

document.getElementById("stateSearch").addEventListener("input", updateStatePicker);
document.getElementById("stateSearch").addEventListener("keydown", event => {
  if(event.key === "Escape"){
    event.preventDefault();
    const picker = document.getElementById("statePicker");
    picker.open = false;
    picker.querySelector("summary").focus();
  }
});
document.getElementById("selectVisibleStatesBtn").addEventListener("click", () => {
  const visible = [...document.querySelectorAll("#stateChecks input")]
    .filter(input => !input.closest(".state-check").hidden && !input.checked);
  if(!visible.length) return;
  visible.forEach(input => { input.checked = true; });
  visible[0].dispatchEvent(new Event("change", { bubbles:true }));
});
document.getElementById("selectedStateChips").addEventListener("click", event => {
  const chip = event.target.closest("[data-uf]");
  if(!chip) return;
  const input = document.querySelector(`#stateChecks input[value="${chip.dataset.uf}"]`);
  if(!input) return;
  input.checked = false;
  input.dispatchEvent(new Event("change", { bubbles:true }));
});
document.addEventListener("pointerdown", event => {
  if(!event.target.closest(".state-picker")) document.getElementById("statePicker").open = false;
});

document.getElementById("stateChecks").addEventListener("change", () => {
  stateSelectionRevision++;
  clearMunicipalityFilter();
  const chosen = selectedStates();
  updateStatePicker();
  refreshMapFocusOptions();
  if(uploadedRowsLoaded){
    document.getElementById("selectedStatesLabel").textContent = chosen.length
      ? `${chosen.length} estado${chosen.length === 1 ? "" : "s"} no arquivo selecionado`
      : "Arquivo selecionado · Brasil inteiro";
    updateComparisonOptions();
    scheduleApplyFilters();
    return;
  }
  if(chosen.length && dataLoaded){
    updateComparisonOptions();
    applyFilters();
  }
  document.getElementById("selectedStatesLabel").textContent = chosen.length
    ? `${chosen.length} estado${chosen.length === 1 ? "" : "s"} selecionado${chosen.length === 1 ? "" : "s"} · atualizando dados...`
    : (loadedStateSelection.length
      ? `Busca atual: ${loadedStateSelection.join(", ")} · atualizando seleção...`
      : "Nenhum estado selecionado · marque estados para carregar");
  if(chosen.length) loadSelectedStateData(chosen, stateSelectionRevision);
  else clearStateResults();
});

document.getElementById("clearStatesBtn").addEventListener("click", () => {
  stateSelectionRevision++;
  document.querySelectorAll("#stateChecks input").forEach(input => { input.checked = false; });
  updateStatePicker();
  refreshMapFocusOptions();
  clearMunicipalityFilter();
  if(uploadedRowsLoaded){
    loadedStateSelection = [];
    document.getElementById("selectedStatesLabel").textContent = "Arquivo selecionado · Brasil inteiro";
    updateComparisonOptions();
    scheduleApplyFilters();
  }else clearStateResults();
});

document.getElementById("resetBtn").addEventListener("click", () => {
  const dateFrom = document.getElementById("dateFrom");
  const dateTo = document.getElementById("dateTo");

  dateFrom.value = dateFrom.min || "";
  dateTo.value = dateTo.max || "";

  ["sexSel","raceSel","schoolSel","chapterSel","categorySel"].forEach(id => {
    document.getElementById(id).value = "";
  });
  clearMunicipalityFilter();
  document.querySelectorAll("#stateChecks input").forEach(input => { input.checked = false; });
  document.getElementById("stateSearch").value = "";
  updateStatePicker();
  refreshMapFocusOptions();
  stateSelectionRevision++;

  document.getElementById("searchInput").value = "";
  if(!uploadedRowsLoaded){
    clearStateResults();
    setMapView("");
  }else if(dataLoaded){
    loadedStateSelection = [];
    refreshCategoryOptions();
    updateComparisonOptions();
    applyFilters();
    setMapView("");
    document.getElementById("selectedStatesLabel").textContent = "Arquivo selecionado · Brasil inteiro";
  }
});

/* ============================================================
   7. Inicialização
   ============================================================ */
loadBrazil();
state.filterMetadata = buildFilterMetadata([]);
renderStateChecklist();
initializeEmptyFilters();

setStatus("Marque um ou mais estados para carregar os dados. Os filtros atualizam automaticamente.", "success");

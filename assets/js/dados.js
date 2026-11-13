/* ============================================================
   Dados: leitura dos arquivos agregados e consultas básicas
   ------------------------------------------------------------
   Nada aqui baixa microdados: os arquivos já vêm agregados pelos
   scripts de preparação. Arquivos por UF e por ano são carregados
   sob demanda e ficam em cache (ver carregar() em utils.js).
   ============================================================ */
const base = {
  pronto: false,
  municipios: [],            // [{c, n, uf, busca}]
  munPorCodigo: new Map(),
  cid: null,                 // catálogo (capítulos, grupos, categorias)
  catPorCodigo: new Map(),   // "I21" → {codigo, nome, grupo, cap, sup}
  pop: new Map(),            // código ou UF/BR → {2022, 2024, 2025, 2026}
  indices: {},               // {obitos, internacoes, dengue}: índice de cada fonte
  indicadores: new Map(),    // código → {id: valor}
  dicionario: null,
  indPorId: new Map(),
  conhecimento: null,
  atualizacao: null,           // {gerado_em, frequencia_painel}: mostrado no topo de todas as telas
  situacoes: {}                // indicador → {município: motivo da ausência}
};

async function carregarBase(){
  const [mun, cid, pop, popUF, sim, sih, dengue, ind, dic, conhecimento, situacoes, cobertura, manifestos] = await Promise.all([
    fetchJSON(PATHS.municipios), fetchJSON(PATHS.cid), fetchCSV(PATHS.populacao), fetchCSV(PATHS.populacaoUF),
    fetchJSON(PATHS.simIndice), fetchJSON(PATHS.sihIndice), fetchJSON(PATHS.dengueIndice),
    fetchCSV(PATHS.indicadores), fetchJSON(PATHS.dicionario), fetchJSON(PATHS.conhecimento), fetchJSON(PATHS.situacoes),
    fetchJSON(PATHS.cobertura), fetchJSON(PATHS.manifestos)
  ]);
  base.atualizacao = { gerado_em: cobertura.gerado_em, frequencia: manifestos.frequencia_painel || "mensal" };
  base.situacoes = situacoes;
  base.municipios = mun.municipios.map(m => ({ ...m, busca: normText(m.n) }));
  base.municipios.forEach(m => base.munPorCodigo.set(m.c, m));
  base.cid = cid;
  cid.categorias.forEach(([codigo, nome, g, classif, sup]) => {
    base.catPorCodigo.set(codigo, { codigo, nome, grupo: g, cap: cid.grupos[g].cap, classif, sup: Boolean(sup) });
  });
  for(const tabela of [pop, popUF]){
    const anos = tabela.cabecalho.slice(1).map(c => c.slice(1));
    for(const linha of tabela.registros){
      const item = {};
      anos.forEach((ano, i) => { if(linha[i + 1] !== "") item[ano] = Number(linha[i + 1]); });
      base.pop.set(linha[0], item);
    }
  }
  base.indices = { obitos: sim, internacoes: sih, dengue };
  const colunas = ind.cabecalho.slice(1);
  for(const linha of ind.registros){
    const item = {};
    colunas.forEach((id, i) => { if(linha[i + 1] !== "" && linha[i + 1] !== undefined) item[id] = Number(linha[i + 1]); });
    base.indicadores.set(linha[0], item);
  }
  base.dicionario = dic;
  dic.indicadores.forEach(i => base.indPorId.set(i.id, i));
  base.conhecimento = conhecimento;
  base.pronto = true;
}

/* ---------- Territórios ---------- */
function nomeLocal(local){
  if(local === "BR") return "Brasil";
  if(UF_NAMES[local]) return `${UF_NAMES[local]} (UF)`;
  const m = base.munPorCodigo.get(local);
  return m ? `${m.n} (${m.uf})` : local;
}
const ehMunicipio = local => /^\d{7}$/.test(local);
const ufDe = local => ehMunicipio(local) ? UF_BY_IBGE_PREFIX[local.slice(0, 2)] : local;

function buscarMunicipios(texto, limite = 8){
  const q = normText(texto);
  if(!q) return [];
  // "campinas sp" ou "campinas - sp": a última palavra pode ser a UF
  const partes = q.split(" ");
  const ufFinal = partes.length > 1 && UF_NAMES[partes[partes.length - 1].toUpperCase()] ? partes.pop().toUpperCase() : "";
  const nome = partes.join(" ");
  const comeca = [], contem = [];
  for(const m of base.municipios){
    if(ufFinal && m.uf !== ufFinal) continue;
    if(m.busca.startsWith(nome)) comeca.push(m);
    else if(m.busca.includes(nome)) contem.push(m);
  }
  const porPop = (a, b) => (popDe(b.c, "2025")?.valor || 0) - (popDe(a.c, "2025")?.valor || 0);
  return [...comeca.sort(porPop), ...contem.sort(porPop)].slice(0, limite);
}

/* População usada como denominador. 2023 não tem estimativa oficial: usa o Censo 2022
   e devolve defasado = true para a interface avisar. */
function popDe(local, ano){
  const item = base.pop.get(local);
  if(!item) return null;
  if(item[ano] != null) return { valor: item[ano], ano, defasado: false, origem: ano === "2022" ? "Censo 2022" : `estimativa IBGE ${ano}` };
  if(ano === "2023" && item["2022"] != null) return { valor: item["2022"], ano: "2022", defasado: true, origem: "Censo 2022 (não há estimativa para 2023)" };
  return null;
}

function porteDe(populacao){
  return PORTES.findIndex(p => populacao <= p.max);
}

/* ---------- CID: seleção de causa ---------- */
/* "todas" | "cap:9" | "g:I20-I25" | "c:I21"  →  intervalo de categorias de 3 caracteres */
function lerCausa(texto){
  const cid = base.cid;
  if(!texto || texto === "todas") return { id:"todas", tipo:"todas", ini:"A00", fim:"Z99", rotulo:"Todas as causas", curto:"todas as causas", cap:null };
  const [tipo, valor] = texto.split(":");
  if(tipo === "cap"){
    const cap = cid.capitulos.find(c => String(c.n) === valor);
    if(cap) return { id:texto, tipo:"cap", ini:cap.ini, fim:cap.fim, cap:cap.n, rotulo:`Capítulo ${cap.rom} — ${cap.nome}`, curto:cap.nome, codigo:`${cap.ini}–${cap.fim}`, natureza:cap.tipo };
  }
  if(tipo === "g"){
    const [ini, fim] = (valor || "").split("-");
    const grupo = cid.grupos.find(g => g.ini === ini && g.fim === fim);
    if(grupo) return { id:texto, tipo:"g", ini, fim, cap:grupo.cap, rotulo:`${ini}–${fim} ${grupo.nome}`, curto:grupo.nome, codigo:`${ini}–${fim}`, natureza:cid.capitulos[grupo.cap - 1].tipo };
  }
  if(tipo === "c"){
    const cat = base.catPorCodigo.get(valor);
    if(cat) return { id:texto, tipo:"c", ini:valor, fim:valor, cap:cat.cap, rotulo:`${valor} ${cat.nome}`, curto:cat.nome, codigo:valor, natureza:cid.capitulos[cat.cap - 1].tipo };
  }
  return lerCausa("todas");
}

function contarCausa(porCid, causa){
  if(!porCid) return 0;
  if(causa.tipo === "todas") return porCid.total;
  if(causa.tipo === "c") return porCid.get(causa.ini) || 0;
  let n = 0;
  for(const [codigo, q] of porCid){
    if(codigo >= causa.ini && codigo <= causa.fim) n += q;
  }
  return n;
}

function mapaComTotal(){
  const m = new Map();
  m.total = 0;
  return m;
}

/* ---------- Óbitos (SIM) ---------- */
/* Map município → Map categoria → óbitos (com .total) */
function simMunicipios(ano, uf){
  return carregarDerivado(`simMun:${ano}:${uf}`, async () => {
    const { registros } = await fetchCSV(PATHS.simMun(ano, uf));
    const porMun = new Map();
    for(const [mun, cid3, n] of registros){
      let item = porMun.get(mun);
      if(!item) porMun.set(mun, item = mapaComTotal());
      item.set(cid3, Number(n));
      item.total += Number(n);
    }
    return porMun;
  });
}

/* Map UF (e "BR") → { cid3: Map (com .total), cid4: Map } */
function simUFs(ano){
  return carregarDerivado(`simUF:${ano}`, async () => {
    const { registros } = await fetchCSV(PATHS.simUF(ano));
    const porUF = new Map();
    const novo = () => ({ cid3: mapaComTotal(), cid4: new Map() });
    porUF.set("BR", novo());
    for(const [uf, cid, nTexto] of registros){
      const n = Number(nTexto);
      if(!porUF.has(uf)) porUF.set(uf, novo());
      for(const item of [porUF.get(uf), porUF.get("BR")]){
        const c3 = cid.slice(0, 3);
        item.cid3.set(c3, (item.cid3.get(c3) || 0) + n);
        item.cid3.total += n;
        item.cid4.set(cid, (item.cid4.get(cid) || 0) + n);
      }
    }
    return porUF;
  });
}

/* Perfil: Map local → Map "cap|sexo|faixa" → óbitos */
function lerPerfil(chave, url){
  return carregarDerivado(chave, async () => {
    const { registros } = await fetchCSV(url);
    const porLocal = new Map();
    for(const [local, cap, sexo, faixa, n] of registros){
      let item = porLocal.get(local);
      if(!item) porLocal.set(local, item = new Map());
      item.set(`${cap}|${sexo}|${faixa}`, Number(n));
    }
    return porLocal;
  });
}
const simPerfilMun = (ano, uf) => lerPerfil(`perfil:${ano}:${uf}`, PATHS.simPerfil(ano, uf));
const simPerfilUF = ano => lerPerfil(`perfilUF:${ano}`, PATHS.simUFPerfil(ano));

/* População do Censo 2022 por sexo e faixa: Map local → Map "sexo|faixa" → pessoas */
function lerIdade(chave, url){
  return carregarDerivado(chave, async () => {
    const { registros } = await fetchCSV(url);
    const porLocal = new Map();
    for(const [local, sexo, faixa, n] of registros){
      let item = porLocal.get(local);
      if(!item) porLocal.set(local, item = new Map());
      item.set(`${sexo}|${faixa}`, Number(n));
    }
    return porLocal;
  });
}
const idadeMunicipios = uf => lerIdade(`idade:${uf}`, PATHS.idadeMun(uf));
const idadeUFs = () => lerIdade("idadeUF", PATHS.idadeUF);

/* ---------- Internações (SIH) e dengue (SINAN) ---------- */
/* Map local (município, UF, BR) → Map capítulo(texto) → internações (com .total) */
function sihAno(ano){
  return carregarDerivado(`sih:${ano}`, async () => {
    const { registros } = await fetchCSV(PATHS.sih(ano));
    const porLocal = new Map();
    const somar = (local, cap, n) => {
      let item = porLocal.get(local);
      if(!item) porLocal.set(local, item = mapaComTotal());
      item.set(cap, (item.get(cap) || 0) + n);
      item.total += n;
    };
    for(const [mun, cap, nTexto] of registros){
      const n = Number(nTexto);
      somar(mun, cap, n);
      somar(UF_BY_IBGE_PREFIX[mun.slice(0, 2)], cap, n);
      somar("BR", cap, n);
    }
    return porLocal;
  });
}

/* Map local → Map ano → casos prováveis */
function dengueCasos(){
  return carregarDerivado("dengue", async () => {
    const { registros } = await fetchCSV(PATHS.dengue);
    const porLocal = new Map();
    const somar = (local, ano, n) => {
      let item = porLocal.get(local);
      if(!item) porLocal.set(local, item = new Map());
      item.set(ano, (item.get(ano) || 0) + n);
    };
    for(const [mun, ano, nTexto] of registros){
      const n = Number(nTexto);
      somar(mun, ano, n);
      somar(UF_BY_IBGE_PREFIX[mun.slice(0, 2)], ano, n);
      somar("BR", ano, n);
    }
    return porLocal;
  });
}

const _derivados = new Map();
function carregarDerivado(chave, fabrica){
  if(!_derivados.has(chave)){
    const promessa = fabrica();
    promessa.catch(() => _derivados.delete(chave));
    _derivados.set(chave, promessa);
  }
  return _derivados.get(chave);
}

/* ---------- Disponibilidade ---------- */
function anosDe(evento){
  return Object.keys(base.indices[evento]?.anos || {}).sort();
}

function infoAno(evento, ano){
  const item = base.indices[evento]?.anos?.[ano];
  if(!item) return null;
  if(evento === "dengue"){
    const corrente = ano === anosDe("dengue").slice(-1)[0];
    return { ...item, ano_completo: !corrente, periodo: corrente ? "ano em andamento (notificações até a data da coleta)" : "ano de notificação completo" };
  }
  return item;
}

/* O evento consegue responder a esta causa? Devolve {ok, motivo, causaUsada}. */
function disponibilidade(evento, causa){
  if(evento === "obitos") return { ok:true, causa };
  if(evento === "internacoes"){
    if(causa.tipo === "todas") return { ok:true, causa };
    const caps = base.indices.internacoes.anos[anosDe("internacoes")[0]]?.capitulos || [];
    if(causa.tipo === "cap"){
      return caps.includes(causa.cap) ? { ok:true, causa }
        : { ok:false, motivo:"O SIH/SUS não registra internações com diagnóstico principal neste capítulo." };
    }
    return { ok:false, motivo:"As internações foram importadas apenas por capítulo da CID-10. Não há dado municipal para este grupo ou código específico.", alternativa:`cap:${causa.cap}` };
  }
  if(evento === "dengue"){
    const ehDengue = causa.tipo !== "todas" && causa.ini >= "A90" && causa.fim <= "A97" && ["A90","A91","A97"].some(c => c >= causa.ini && c <= causa.fim);
    return ehDengue ? { ok:true, causa }
      : { ok:false, motivo:"As notificações importadas do SINAN são apenas de dengue (CID-10 A90, A91 e A97).", alternativa:"c:A90" };
  }
  return { ok:false, motivo:"Tipo de evento desconhecido." };
}

/* Contagem de eventos de um local (município, UF ou BR). null = dado indisponível. */
async function contarEventos(local, causa, evento, ano){
  if(!infoAno(evento, ano)) return null;
  if(evento === "obitos"){
    if(ehMunicipio(local)){
      const porMun = await simMunicipios(ano, ufDe(local));
      // Município sem linha no arquivo: nenhum óbito registrado no arquivo publicado.
      return contarCausa(porMun.get(local), causa);
    }
    return contarCausa((await simUFs(ano)).get(local)?.cid3, causa);
  }
  if(evento === "internacoes"){
    const item = (await sihAno(ano)).get(local);
    if(causa.tipo === "todas") return item ? item.total : 0;
    return item ? (item.get(String(causa.cap)) || 0) : 0;
  }
  if(evento === "dengue"){
    const item = (await dengueCasos()).get(local);
    return item ? (item.get(ano) || 0) : 0;
  }
  return null;
}

/* Por que um indicador não tem valor no município (texto para a interface). */
function motivoSemIndicador(mun, id){
  const codigo = base.situacoes[id]?.[mun] || "indisponivel";
  return { indisponivel:"indisponível (a fonte não publica o valor)", suprimido:"suprimido pela fonte (sigilo)", nao_se_aplica:"não se aplica a este município" }[codigo] || "indisponível";
}
